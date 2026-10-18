"""
Layer 1: Deterministic Physics Math & Kinematic Engine for ApexGuard.
Implements vector calculus in <4ms per Spec §6:
1. Relative Longitudinal Motion (Closing Velocity)
2. Relative Lateral Convergence (Squeeze Rate)
3. Chassis Overlap Gating
4. Contact Detection via Chassis Boundary Breach and G-Impulse Spikes
"""

from typing import Optional, Tuple, Dict, Any, List
import numpy as np

from backend.app.ingest.schemas import SessionState, SynchronizedFrame
from backend.app.layer1_math.schemas import IncidentStateVector

CHASSIS_LENGTH_M = 5.6
CHASSIS_WIDTH_M = 2.0


def compute_kinematics(
    session: SessionState,
    incident_id: Optional[str] = None,
    time_window: Optional[Tuple[float, float]] = None
) -> IncidentStateVector:
    """
    Computes pure kinematic relative motion vectors over the incident slice
    without arbitrary corner assumptions.
    """
    # 1. Determine active time slice
    t_start, t_end = 0.0, session.duration_s
    inc_marker = None

    if incident_id:
        for m in session.incident_markers:
            if m.incident_id == incident_id:
                inc_marker = m
                break

    if inc_marker:
        t_start, t_end = inc_marker.slice_start, inc_marker.slice_end
        target_timestamp = inc_marker.timestamp
    elif session.active_slice:
        t_start, t_end = session.active_slice.start_time, session.active_slice.end_time
        target_timestamp = session.active_slice.incident_time
    elif time_window:
        t_start, t_end = time_window
        target_timestamp = (t_start + t_end) / 2.0
    else:
        target_timestamp = session.duration_s / 2.0

    if time_window:
        t_start, t_end = time_window

    # Filter frames within window
    frames: List[SynchronizedFrame] = [
        f for f in session.timeline if t_start <= f.t <= t_end
    ]
    if len(frames) < 3:
        # Fallback to entire timeline if window too narrow
        frames = session.timeline

    ts = np.array([f.t for f in frames], dtype=np.float64)
    dt = np.gradient(ts)
    dt[dt <= 0] = 0.05  # avoid division by zero

    # Extract coordinate and kinematic series
    xa = np.array([f.car_a.x for f in frames], dtype=np.float64)
    za = np.array([f.car_a.z for f in frames], dtype=np.float64)
    va = np.array([f.car_a.speed_kmh for f in frames], dtype=np.float64)
    da = np.array([f.car_a.distance_m for f in frames], dtype=np.float64)
    ha = np.array([f.car_a.heading_rad for f in frames], dtype=np.float64)
    g_lata = np.array([f.car_a.glat for f in frames], dtype=np.float64)
    g_lona = np.array([f.car_a.glon for f in frames], dtype=np.float64)

    xb = np.array([f.car_b.x for f in frames], dtype=np.float64)
    zb = np.array([f.car_b.z for f in frames], dtype=np.float64)
    vb = np.array([f.car_b.speed_kmh for f in frames], dtype=np.float64)
    db = np.array([f.car_b.distance_m for f in frames], dtype=np.float64)
    hb = np.array([f.car_b.heading_rad for f in frames], dtype=np.float64)
    g_latb = np.array([f.car_b.glat for f in frames], dtype=np.float64)
    g_lonb = np.array([f.car_b.glon for f in frames], dtype=np.float64)

    # Euclidean separation
    sep = np.hypot(xa - xb, za - zb)
    min_idx = int(np.argmin(sep))
    peak_t = float(ts[min_idx])
    min_sep = float(sep[min_idx])

    # Reference heading vector at each frame (average of both headings)
    mean_heading = np.arctan2((np.sin(ha) + np.sin(hb)) / 2.0, (np.cos(ha) + np.cos(hb)) / 2.0)
    u_fwd_x = np.cos(mean_heading)
    u_fwd_z = np.sin(mean_heading)
    u_lat_x = -np.sin(mean_heading)
    u_lat_z = np.cos(mean_heading)

    # Relative displacement vector (Car A - Car B)
    rel_x = xa - xb
    rel_z = za - zb

    # Along-track longitudinal displacement and lateral gap
    along_track_disp = rel_x * u_fwd_x + rel_z * u_fwd_z
    along_track_gap = np.abs(along_track_disp)
    lateral_disp = rel_x * u_lat_x + rel_z * u_lat_z
    lateral_gap = np.abs(lateral_disp)

    # 3. Overlap Gating: (L_chassis - delta_s) / L_chassis per Spec §6
    overlap_series = np.clip((CHASSIS_LENGTH_M - along_track_gap) / CHASSIS_LENGTH_M, 0.0, 1.0)
    overlap_peak = float(overlap_series[min_idx])

    # Determine Attacker vs Defender
    # Look at the pre-incident approach (first third of window or frame 0 to min_idx)
    early_idx = max(0, min_idx - 5)
    # The car that is behind longitudinally (or has lower lap distance) prior to contact is the attacker
    if along_track_disp[early_idx] < 0:
        # Car A is behind Car B -> Car A is attacker
        attacker_id = "competitor_a"
        defender_id = "competitor_b"
        attacker_driver = session.competitor_a.driver
        defender_driver = session.competitor_b.driver
        att_dist = da
        def_dist = db
        att_v = va
        def_v = vb
    else:
        # Car B is behind Car A -> Car B is attacker
        attacker_id = "competitor_b"
        defender_id = "competitor_a"
        attacker_driver = session.competitor_b.driver
        defender_driver = session.competitor_a.driver
        att_dist = db
        def_dist = da
        att_v = vb
        def_v = va

    # 1. Closing velocity: v_close = d/dt(dist_defender - dist_attacker)
    # When attacker is catching defender, def_dist - att_dist shrinks, so rate of closure is negative derivative
    dist_delta = def_dist - att_dist
    v_close_series = -np.gradient(dist_delta, ts) * 3.6  # convert m/s to km/h
    # Smooth closing velocity
    closing_v = float(np.mean(v_close_series[max(0, min_idx - 3):min_idx + 1]))

    # 2. Relative Lateral Convergence (Squeeze Rate): v_lat = -d/dt(lateral_clearance)
    v_lat_series = -np.gradient(lateral_gap, ts)  # in m/s
    v_lat = float(np.max(v_lat_series[max(0, min_idx - 5):min_idx + 2]))

    # 4. Contact Detection:
    # Chassis boundary breach (<2.0m) or G-force vector spike (sudden d/dt impulse)
    jerk_a = np.hypot(np.gradient(g_lata, ts), np.gradient(g_lona, ts))
    jerk_b = np.hypot(np.gradient(g_latb, ts), np.gradient(g_lonb, ts))
    peak_jerk = float(max(np.max(jerk_a), np.max(jerk_b)))

    chassis_breach = min_sep < 2.0
    g_spike = peak_jerk > 2.5
    has_contact = bool(chassis_breach or g_spike)

    contact_time = None
    if has_contact:
        contact_indices = np.where((sep < 2.0) | (jerk_a > 2.5) | (jerk_b > 2.5))[0]
        if len(contact_indices) > 0:
            contact_time = float(ts[contact_indices[0]])
        else:
            contact_time = peak_t

    # Speed at peak
    speed_att = float(att_v[min_idx])
    speed_def = float(def_v[min_idx])
    delta_v = float(speed_att - speed_def)
    peak_along_gap = float(along_track_gap[min_idx])
    peak_lat_gap = float(lateral_gap[min_idx])

    # Categorization per Spec §6:
    # 1. REAR_END_SHUNT: along-track gap < 1.0m & lateral gap < 1.5m
    # 2. APEX_DIVEBOMB: overlap < 50% & high approach speed delta (>15 km/h)
    # 3. CROWD_SQUEEZE: overlap >= 30% & lateral room closing < 2.0m
    # 4. RACING_INCIDENT: otherwise
    categorization = "RACING_INCIDENT"
    severity = 0.2

    bumper_gap = max(0.0, peak_along_gap - CHASSIS_LENGTH_M)
    is_in_line = peak_lat_gap < 1.5

    if (peak_along_gap < 1.0 and is_in_line) or (is_in_line and bumper_gap < 1.0 and closing_v > 0):
        categorization = "REAR_END_SHUNT"
        severity = 0.9 if has_contact else 0.75
    elif overlap_peak < 0.50 and delta_v > 15.0 and min_sep < 3.0:
        categorization = "APEX_DIVEBOMB"
        severity = 0.85 if has_contact else 0.65
    elif overlap_peak >= 0.30 and peak_lat_gap < 2.0 and v_lat > 0.4:
        categorization = "CROWD_SQUEEZE"
        severity = 0.75 if has_contact else 0.5
    elif has_contact and min_sep < 2.0:
        if is_in_line:
            categorization = "REAR_END_SHUNT"
            severity = 0.85
        elif overlap_peak >= 0.50:
            categorization = "RACING_INCIDENT"
            severity = 0.5
        else:
            categorization = "APEX_DIVEBOMB"
            severity = 0.75

    facts = {
        "min_separation_m": round(min_sep, 2),
        "peak_time_s": round(peak_t, 3),
        "closing_velocity_kmh": round(closing_v, 2),
        "lateral_convergence_ms": round(v_lat, 2),
        "overlap_percentage": round(overlap_peak * 100.0, 1),
        "along_track_gap_m": round(peak_along_gap, 2),
        "lateral_gap_m": round(peak_lat_gap, 2),
        "has_contact": has_contact,
        "contact_time_s": round(contact_time, 3) if contact_time else None,
        "peak_g_jerk": round(peak_jerk, 2),
        "speed_attacker_kmh": round(speed_att, 1),
        "speed_defender_kmh": round(speed_def, 1),
        "speed_delta_kmh": round(delta_v, 1),
    }

    return IncidentStateVector(
        incident_id=incident_id or (inc_marker.incident_id if inc_marker else "incident_primary"),
        timestamp=round(peak_t, 3),
        window_start=round(t_start, 3),
        window_end=round(t_end, 3),
        min_separation_m=round(min_sep, 2),
        closing_velocity_kmh=round(closing_v, 2),
        lateral_convergence_ms=round(v_lat, 2),
        overlap_ratio=round(overlap_peak, 3),
        along_track_gap_m=round(peak_along_gap, 2),
        lateral_gap_m=round(peak_lat_gap, 2),
        has_contact=has_contact,
        contact_time=round(contact_time, 3) if contact_time else None,
        contact_impulse_g=round(peak_jerk, 2),
        speed_attacker_kmh=round(speed_att, 1),
        speed_defender_kmh=round(speed_def, 1),
        delta_v_kmh=round(delta_v, 1),
        attacker_id=attacker_id,
        defender_id=defender_id,
        attacker_driver=attacker_driver,
        defender_driver=defender_driver,
        categorization=categorization,
        severity_score=round(severity, 2),
        telemetry_facts=facts,
    )
