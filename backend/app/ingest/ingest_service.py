"""
Telemetry Ingestion Service for ApexGuard.
Handles dynamic multi-car CSV parsing, canonical coordinate mapping,
20Hz timeline synchronization, continuous Euclidean separation analysis,
and multi-incident discovery per Spec §2.1, §2.2, §2.3, §2.4.
"""

import uuid
import re
from typing import Tuple, List, Dict, Any, Optional
import numpy as np

from backend.app.ingest.schemas import (
    CompetitorMeta,
    CarTelemetryFrame,
    SynchronizedFrame,
    IncidentTimelineMarker,
    ActiveSlice,
    SessionState,
    TrackGeometry,
)
from backend.app.ingest.track_loader import TrackLoader


def clean_channel_name(col: str) -> str:
    """Normalize column header: lowercase, remove brackets, spaces, percentages, underscores."""
    return re.sub(r"[\[\]%_\s-]", "", col).lower()


class TelemetryParser:
    """Parses raw CSV bytes/strings into dynamic metadata and standardized arrays."""

    @staticmethod
    def parse_header_metadata(lines: List[str], fallback_label: str) -> Tuple[CompetitorMeta, str]:
        """
        Extracts metadata dynamically from lines 1-7 per Spec §2.2:
          Line 1, Field 3: Driver Identifier
          Line 3, Field 4: Track Identifier
          Line 3, Field 5: Vehicle / Team
          Line 3, Field 7: Reference Laptime
        """
        driver = f"Competitor {fallback_label}"
        track = "Custom Circuit"
        car = f"Vehicle {fallback_label}"
        ref_laptime: Optional[float] = None

        if len(lines) >= 1:
            parts1 = [p.strip() for p in lines[0].split(",")]
            if len(parts1) >= 3 and parts1[2]:
                driver = parts1[2].strip()

        if len(lines) >= 3:
            parts3 = [p.strip() for p in lines[2].split(",")]
            if len(parts3) >= 4 and parts3[3]:
                track = parts3[3].strip()
            if len(parts3) >= 5 and parts3[4]:
                car = parts3[4].strip()
            if len(parts3) >= 7 and parts3[6]:
                try:
                    ref_laptime = float(parts3[6])
                except ValueError:
                    pass

        return CompetitorMeta(driver=driver, car=car, reference_laptime=ref_laptime), track

    @staticmethod
    def map_columns(header_cols: List[str]) -> Dict[str, Tuple[int, str]]:
        """
        Maps raw column names to canonical channel keys and detects unit conventions.
        Returns dict of canonical_key -> (col_index, unit_hint).
        """
        mapping: Dict[str, Tuple[int, str]] = {}
        for idx, col in enumerate(header_cols):
            raw_clean = clean_channel_name(col)
            lower_col = col.lower()

            # Coordinates: X and Z (horizontal plane), Y is vertical elevation
            if raw_clean in ("xm", "x"):
                mapping["x"] = (idx, "m")
            elif raw_clean in ("zm", "z"):
                mapping["z"] = (idx, "m")
            elif raw_clean in ("ym", "y"):
                mapping["y"] = (idx, "m")

            # Timestamp: laptime or time
            elif "laptime" in raw_clean or raw_clean == "time":
                mapping["time"] = (idx, "s")

            # Distance
            elif "lapdistance" in raw_clean or raw_clean == "distance":
                mapping["distance"] = (idx, "m")

            # Speed
            elif "speed" in raw_clean and "wheelspeed" not in raw_clean and "woldspeed" not in raw_clean:
                unit = "m/s" if "m/s" in lower_col else "km/h"
                # If both exists, prefer generic speed
                if "speed" not in mapping:
                    mapping["speed"] = (idx, unit)

            # Driver inputs
            elif "throttle" in raw_clean:
                mapping["throttle"] = (idx, "%")
            elif "brake" in raw_clean and "braketemperature" not in raw_clean and "brakepressure" not in raw_clean:
                mapping["brake"] = (idx, "%")
            elif "steer" in raw_clean:
                mapping["steer"] = (idx, "%")
            elif raw_clean == "gear":
                mapping["gear"] = (idx, "int")

            # Accelerations (G-forces)
            elif raw_clean in ("glat", "gforcelatitudinal"):
                mapping["glat"] = (idx, "G")
            elif raw_clean in ("glon", "gforcelongitudinal"):
                mapping["glon"] = (idx, "G")

        # Validate required channels
        required = ["time", "x", "z", "speed"]
        missing = [r for r in required if r not in mapping]
        if missing:
            raise ValueError(f"Missing mandatory telemetry channels: {missing} in header: {header_cols[:15]}")

        return mapping

    @classmethod
    def parse_csv_content(cls, content: str, fallback_label: str) -> Tuple[CompetitorMeta, str, Dict[str, np.ndarray]]:
        """Parses CSV text into metadata, track name, and dict of channel numpy arrays."""
        lines = [line.strip() for line in content.strip().splitlines() if line.strip()]
        if len(lines) < 9:
            raise ValueError(f"CSV file has insufficient rows ({len(lines)}). Expected metadata rows + data.")

        metadata_lines = lines[:7]
        header_line = lines[7]
        data_lines = lines[8:]

        meta, track_name = cls.parse_header_metadata(metadata_lines, fallback_label)
        header_cols = [c.strip() for c in header_line.split(",")]
        mapping = cls.map_columns(header_cols)

        parsed_rows: List[List[float]] = []
        for line in data_lines:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < len(header_cols):
                continue
            row_vals = []
            valid = True
            for p in parts:
                try:
                    row_vals.append(float(p) if p != "" else 0.0)
                except ValueError:
                    valid = False
                    break
            if valid:
                parsed_rows.append(row_vals)

        if len(parsed_rows) < 10:
            raise ValueError("CSV contains fewer than 10 valid telemetry data frames.")

        raw_matrix = np.array(parsed_rows, dtype=np.float64)
        channel_arrays: Dict[str, np.ndarray] = {}

        for key, (col_idx, unit) in mapping.items():
            vals = raw_matrix[:, col_idx]
            if key == "speed" and unit == "m/s":
                # Spec §2.3: Physical speed unit validation.
                # In IBaldo opponent telemetry exports, the header is labeled 'speed [m/s]'
                # but values are already expressed in km/h.
                # An F1 car's maximum speed physically does not exceed ~105 m/s (~378 km/h).
                # If maximum speed > 110.0, the data is already km/h.
                is_really_ms = True
                max_v = float(np.nanmax(vals))
                if max_v > 110.0:
                    is_really_ms = False
                elif "distance" in mapping and "time" in mapping:
                    # Cross-check derivative velocity against delta-distance / delta-time
                    t_vals = raw_matrix[:, mapping["time"][0]]
                    d_vals = raw_matrix[:, mapping["distance"][0]]
                    dt = np.diff(t_vals)
                    dd = np.diff(d_vals)
                    valid_dt = dt > 0.01
                    if np.any(valid_dt):
                        v_deriv = dd[valid_dt] / dt[valid_dt]
                        moving = v_deriv > 10.0
                        if np.any(moving):
                            ratio = float(np.median(vals[:-1][valid_dt][moving] / v_deriv[moving]))
                            if ratio > 2.2:  # ~3.6 ratio indicates values are already km/h
                                is_really_ms = False

                if is_really_ms:
                    vals = vals * 3.6  # Convert genuine m/s to km/h per Spec §2.3
            channel_arrays[key] = vals

        # Provide defaults for missing optional channels
        n_samples = len(raw_matrix)
        for opt in ["throttle", "brake", "steer", "gear", "glat", "glon", "distance"]:
            if opt not in channel_arrays:
                channel_arrays[opt] = np.zeros(n_samples, dtype=np.float64)

        # Ensure timestamps are strictly monotonically increasing
        time_vals = channel_arrays["time"]
        diffs = np.diff(time_vals)
        if np.any(diffs <= 0):
            # Enforce strictly monotonic time
            for i in range(1, len(time_vals)):
                if time_vals[i] <= time_vals[i - 1]:
                    time_vals[i] = time_vals[i - 1] + 0.001
            channel_arrays["time"] = time_vals

        if meta.reference_laptime is None:
            meta.reference_laptime = float(time_vals[-1])

        return meta, track_name, channel_arrays


def calculate_headings(x: np.ndarray, z: np.ndarray) -> np.ndarray:
    """Computes heading angle in radians: atan2(dz, dx) along trajectory."""
    n = len(x)
    dx = np.zeros(n, dtype=np.float64)
    dz = np.zeros(n, dtype=np.float64)

    if n > 1:
        dx[0] = x[1] - x[0]
        dz[0] = z[1] - z[0]
        dx[-1] = x[-1] - x[-2]
        dz[-1] = z[-1] - z[-2]
    if n > 2:
        dx[1:-1] = (x[2:] - x[:-2]) / 2.0
        dz[1:-1] = (z[2:] - z[:-2]) / 2.0

    return np.arctan2(dz, dx)


class IngestService:
    def __init__(self, track_loader: Optional[TrackLoader] = None):
        self.track_loader = track_loader or TrackLoader()

    def process_telemetry(
        self,
        car_a_csv: str,
        car_b_csv: str,
        track_csv: Optional[str] = None,
        track_id: Optional[str] = None,
    ) -> SessionState:
        """
        Executes the full Generic Ingestion Contract per Spec §2:
        1. Extract dynamic metadata from headers
        2. Resample both streams onto unified 20Hz timeline grid
        3. Continuous Separation Analysis (v > 50km/h, minima < 4.0m)
        4. Resolve track geometry with origin-locked fallback corridor
        5. Return normalized SessionState
        """
        meta_a, track_a, data_a = TelemetryParser.parse_csv_content(car_a_csv, "A")
        meta_b, track_b, data_b = TelemetryParser.parse_csv_content(car_b_csv, "B")

        track_name = track_a if track_a != "Custom Circuit" else track_b

        time_a = data_a["time"]
        time_b = data_b["time"]

        # Unified 20Hz timeline grid (t_start to t_end)
        t_start = float(max(time_a.min(), time_b.min()))
        t_end = float(min(time_a.max(), time_b.max()))

        if t_end <= t_start:
            raise ValueError(
                f"No overlapping time interval between Car A [{time_a.min():.2f}, {time_a.max():.2f}] "
                f"and Car B [{time_b.min():.2f}, {time_b.max():.2f}]"
            )

        step_s = 0.05  # 20Hz = 50ms per frame
        t_grid = np.arange(t_start, t_end + 1e-6, step_s)

        # Resample all channels for Car A
        resampled_a: Dict[str, np.ndarray] = {}
        for k, v in data_a.items():
            if k == "time":
                continue
            resampled_a[k] = np.interp(t_grid, time_a, v)

        # Resample all channels for Car B
        resampled_b: Dict[str, np.ndarray] = {}
        for k, v in data_b.items():
            if k == "time":
                continue
            resampled_b[k] = np.interp(t_grid, time_b, v)

        # Calculate instantaneous yaw headings atan2(dz, dx)
        headings_a = calculate_headings(resampled_a["x"], resampled_a["z"])
        headings_b = calculate_headings(resampled_b["x"], resampled_b["z"])

        # Continuous separation analysis
        dx = resampled_a["x"] - resampled_b["x"]
        dz = resampled_a["z"] - resampled_b["z"]
        separation = np.hypot(dx, dz)

        # Racing mask: filter out stationary/pit periods (speed > 50 km/h) per Spec §2.4
        speed_a = resampled_a["speed"]
        speed_b = resampled_b["speed"]
        racing_mask = (speed_a > 50.0) & (speed_b > 50.0)

        # Identify candidate incident peaks (local proximity minima where d(t) < 4.0m)
        incident_markers = self._detect_incident_markers(t_grid, separation, racing_mask, t_start, t_end)

        # Determine active slice: the incident with minimum clearance [t_incident - 4.0s, t_incident + 4.0s]
        active_slice = None
        if incident_markers:
            primary_marker = next((m for m in incident_markers if m.is_primary), incident_markers[0])
            active_slice = ActiveSlice(
                incident_id=primary_marker.incident_id,
                incident_time=primary_marker.timestamp,
                start_time=primary_marker.slice_start,
                end_time=primary_marker.slice_end,
                min_separation_m=primary_marker.distance_m
            )
        else:
            # Fallback active slice: overall closest proximity during racing
            racing_indices = np.where(racing_mask)[0]
            if len(racing_indices) > 0:
                min_idx = racing_indices[np.argmin(separation[racing_indices])]
                min_t = float(t_grid[min_idx])
                min_d = float(separation[min_idx])
            else:
                min_idx = int(np.argmin(separation))
                min_t = float(t_grid[min_idx])
                min_d = float(separation[min_idx])

            active_slice = ActiveSlice(
                incident_id="closest_approach",
                incident_time=round(min_t, 3),
                start_time=round(max(t_start, min_t - 4.0), 3),
                end_time=round(min(t_end, min_t + 4.0), 3),
                min_separation_m=round(min_d, 2)
            )

        # Resolve track geometry (surveyed or origin-locked fallback corridor)
        track_geom = self.track_loader.resolve_track(
            track_name=track_name,
            car_a_x=resampled_a["x"],
            car_a_z=resampled_a["z"],
            track_id=track_id,
            track_csv_path=track_csv,
            car_a_dist=resampled_a.get("distance"),
        )
        if not track_geom.is_fallback:
            track_name = track_geom.track_name

        # Assemble synchronized 20Hz frames
        frames: List[SynchronizedFrame] = []
        for i in range(len(t_grid)):
            frame_a = CarTelemetryFrame(
                x=float(resampled_a["x"][i]),
                z=float(resampled_a["z"][i]),
                speed_kmh=round(float(resampled_a["speed"][i]), 2),
                throttle_pct=round(float(resampled_a["throttle"][i]), 1),
                brake_pct=round(float(resampled_a["brake"][i]), 1),
                steer_pct=round(float(resampled_a["steer"][i]), 2),
                gear=int(round(resampled_a["gear"][i])),
                glat=round(float(resampled_a["glat"][i]), 3),
                glon=round(float(resampled_a["glon"][i]), 3),
                heading_rad=round(float(headings_a[i]), 4),
                distance_m=round(float(resampled_a["distance"][i]), 2),
            )
            frame_b = CarTelemetryFrame(
                x=float(resampled_b["x"][i]),
                z=float(resampled_b["z"][i]),
                speed_kmh=round(float(resampled_b["speed"][i]), 2),
                throttle_pct=round(float(resampled_b["throttle"][i]), 1),
                brake_pct=round(float(resampled_b["brake"][i]), 1),
                steer_pct=round(float(resampled_b["steer"][i]), 2),
                gear=int(round(resampled_b["gear"][i])),
                glat=round(float(resampled_b["glat"][i]), 3),
                glon=round(float(resampled_b["glon"][i]), 3),
                heading_rad=round(float(headings_b[i]), 4),
                distance_m=round(float(resampled_b["distance"][i]), 2),
            )
            frames.append(SynchronizedFrame(
                t=round(float(t_grid[i]), 3),
                car_a=frame_a,
                car_b=frame_b,
                separation_m=round(float(separation[i]), 2),
            ))

        session_id = f"session_{uuid.uuid4().hex[:10]}"
        duration_s = round(t_end - t_start, 2)

        return SessionState(
            session_id=session_id,
            track_name=track_name,
            competitor_a=meta_a,
            competitor_b=meta_b,
            track=track_geom,
            duration_s=duration_s,
            sample_rate_hz=20.0,
            incident_markers=incident_markers,
            active_slice=active_slice,
            timeline=frames,
        )

    def _detect_incident_markers(
        self,
        t_grid: np.ndarray,
        dist: np.ndarray,
        racing_mask: np.ndarray,
        t_start: float,
        t_end: float,
        proximity_threshold_m: float = 4.0,
        cluster_window_s: float = 2.5
    ) -> List[IncidentTimelineMarker]:
        """
        Flags candidate incident peaks where d(t) < 4.0m during active racing (v > 50km/h).
        Clusters temporally adjacent minima within cluster_window_s into single incident events.
        """
        n = len(t_grid)
        raw_minima_indices: List[int] = []

        for i in range(1, n - 1):
            if racing_mask[i] and dist[i] < proximity_threshold_m:
                # Local minimum condition
                if dist[i] <= dist[i - 1] and dist[i] <= dist[i + 1]:
                    raw_minima_indices.append(i)

        if not raw_minima_indices:
            # Check edge cases where continuous region has lowest distance
            under_threshold = np.where(racing_mask & (dist < proximity_threshold_m))[0]
            if len(under_threshold) > 0:
                raw_minima_indices.append(int(under_threshold[np.argmin(dist[under_threshold])]))

        # Cluster adjacent minima
        clusters: List[List[int]] = []
        for idx in raw_minima_indices:
            if not clusters:
                clusters.append([idx])
            else:
                last_cluster = clusters[-1]
                t_last = t_grid[last_cluster[-1]]
                t_curr = t_grid[idx]
                if t_curr - t_last <= cluster_window_s:
                    last_cluster.append(idx)
                else:
                    clusters.append([idx])

        # For each cluster, pick the deepest minimum
        incident_peaks: List[Tuple[float, float]] = []
        for cluster in clusters:
            best_idx = min(cluster, key=lambda i: dist[i])
            incident_peaks.append((float(t_grid[best_idx]), float(dist[best_idx])))

        if not incident_peaks:
            return []

        # Find overall minimum clearance peak
        min_clearance = min(p[1] for p in incident_peaks)

        markers: List[IncidentTimelineMarker] = []
        for i, (t_peak, d_peak) in enumerate(incident_peaks, start=1):
            is_primary = abs(d_peak - min_clearance) < 1e-4
            markers.append(IncidentTimelineMarker(
                incident_id=f"incident_{i}",
                timestamp=round(t_peak, 3),
                distance_m=round(d_peak, 2),
                slice_start=round(max(t_start, t_peak - 4.0), 3),
                slice_end=round(min(t_end, t_peak + 4.0), 3),
                is_primary=is_primary,
            ))

        return markers
