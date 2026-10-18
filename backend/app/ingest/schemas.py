"""
Data models and schemas for ApexGuard telemetry ingestion and track geometry.
Following the generic contract in PROJECT_SPEC.md.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class Point2D(BaseModel):
    x: float = Field(..., description="X coordinate in world meters (horizontal plane)")
    z: float = Field(..., description="Z coordinate in world meters (horizontal plane)")


class TrackBounds(BaseModel):
    min_x: float
    max_x: float
    min_z: float
    max_z: float


class TrackGeometry(BaseModel):
    track_id: str = Field(..., description="Canonical track identifier")
    track_name: str = Field(..., description="Human-readable track name")
    is_fallback: bool = Field(False, description="True if extruded as fallback corridor from Car A line")
    total_length_m: float = Field(..., description="Total track length in meters along centerline")
    origin: Point2D = Field(..., description="Starting anchor point (t=0)")
    bounds: TrackBounds = Field(..., description="Axis-aligned bounding box")
    centerline: List[Point2D] = Field(..., description="Centerline path")
    bound_left: List[Point2D] = Field(..., description="Left track boundary limits")
    bound_right: List[Point2D] = Field(..., description="Right track boundary limits")


class CompetitorMeta(BaseModel):
    driver: str = Field(..., description="Driver identifier")
    car: str = Field(..., description="Vehicle or team name")
    reference_laptime: Optional[float] = Field(None, description="Reference laptime in seconds")


class CarTelemetryFrame(BaseModel):
    x: float = Field(..., description="X coordinate in meters")
    z: float = Field(..., description="Z coordinate in meters")
    speed_kmh: float = Field(..., description="Speed in km/h")
    throttle_pct: float = Field(..., description="Throttle percentage (0-100)")
    brake_pct: float = Field(..., description="Brake percentage (0-100)")
    steer_pct: float = Field(..., description="Steering input percentage (-100 to 100)")
    gear: int = Field(0, description="Engaged gear")
    glat: float = Field(0.0, description="Lateral G-force")
    glon: float = Field(0.0, description="Longitudinal G-force")
    heading_rad: float = Field(..., description="Instantaneous yaw heading angle in radians: atan2(dz, dx)")
    distance_m: float = Field(0.0, description="Lap distance in meters")


class SynchronizedFrame(BaseModel):
    t: float = Field(..., description="Synchronized timeline timestamp in seconds (20Hz)")
    car_a: CarTelemetryFrame
    car_b: CarTelemetryFrame
    separation_m: float = Field(..., description="Euclidean separation distance between centers in meters")


class IncidentTimelineMarker(BaseModel):
    incident_id: str = Field(..., description="Unique incident identifier")
    timestamp: float = Field(..., description="Timestamp of minimum proximity in seconds")
    distance_m: float = Field(..., description="Minimum clearance distance at proximity peak in meters")
    slice_start: float = Field(..., description="Default window start: timestamp - 4.0s")
    slice_end: float = Field(..., description="Default window end: timestamp + 4.0s")
    is_primary: bool = Field(False, description="True if this marker has the lowest clearance in the session")


class ActiveSlice(BaseModel):
    incident_id: str
    incident_time: float
    start_time: float
    end_time: float
    min_separation_m: float


class SessionState(BaseModel):
    session_id: str = Field(..., description="Unique session ID")
    track_name: str = Field(..., description="Circuit name extracted dynamically from metadata")
    competitor_a: CompetitorMeta
    competitor_b: CompetitorMeta
    track: TrackGeometry
    duration_s: float = Field(..., description="Total overlapping session duration in seconds")
    sample_rate_hz: float = Field(20.0, description="Synchronized timeline sampling rate")
    incident_markers: List[IncidentTimelineMarker] = Field(default_factory=list, description="Detected encounter proximity peaks")
    active_slice: Optional[ActiveSlice] = Field(None, description="Primary active incident focus slice")
    timeline: List[SynchronizedFrame] = Field(default_factory=list, description="Synchronized 20Hz frames")
