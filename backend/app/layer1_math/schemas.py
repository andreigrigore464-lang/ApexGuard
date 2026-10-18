"""
Schemas for Layer 1 Kinematic Engine.
"""

from typing import Optional, Dict, Any, Tuple
from pydantic import BaseModel, Field


class IncidentStateVector(BaseModel):
    incident_id: str = Field(..., description="Unique incident identifier")
    timestamp: float = Field(..., description="Timestamp of closest proximity in seconds")
    window_start: float = Field(..., description="Evaluation window start in seconds")
    window_end: float = Field(..., description="Evaluation window end in seconds")
    min_separation_m: float = Field(..., description="Minimum Euclidean center distance in meters")
    closing_velocity_kmh: float = Field(..., description="Longitudinal closing velocity in km/h: d/dt(dist_def - dist_att)")
    lateral_convergence_ms: float = Field(..., description="Lateral convergence rate in m/s: d/dt(lateral_clearance)")
    overlap_ratio: float = Field(..., description="Chassis alongside overlap ratio (0.0 to 1.0)")
    along_track_gap_m: float = Field(..., description="Along-track longitudinal gap in meters")
    lateral_gap_m: float = Field(..., description="Lateral room clearance in meters")
    has_contact: bool = Field(False, description="True if physical chassis breach (<2.0m) or G-impulse spike detected")
    contact_time: Optional[float] = Field(None, description="Timestamp of initial contact detection")
    contact_impulse_g: float = Field(0.0, description="Peak G-force jerk / impulse vector spike in G/s")
    speed_attacker_kmh: float = Field(..., description="Speed of attacking car at proximity peak")
    speed_defender_kmh: float = Field(..., description="Speed of defending car at proximity peak")
    delta_v_kmh: float = Field(..., description="Speed delta (v_attacker - v_defender) in km/h")
    attacker_id: str = Field(..., description="'competitor_a' or 'competitor_b'")
    defender_id: str = Field(..., description="'competitor_a' or 'competitor_b'")
    attacker_driver: str = Field(..., description="Name of attacking driver")
    defender_driver: str = Field(..., description="Name of defending driver")
    categorization: str = Field(..., description="Breach pattern: REAR_END_SHUNT, APEX_DIVEBOMB, CROWD_SQUEEZE, or RACING_INCIDENT")
    severity_score: float = Field(..., description="Estimated incident severity index (0.0 to 1.0)")
    telemetry_facts: Dict[str, Any] = Field(default_factory=dict, description="Detailed physical telemetry measurements")
