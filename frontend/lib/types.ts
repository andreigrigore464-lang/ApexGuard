/**
 * TypeScript definitions for ApexGuard telemetry, track geometry, and governance pipeline.
 * Synchronized with backend Pydantic models.
 */

export interface Point2D {
  x: number;
  z: number;
}

export interface TrackBounds {
  min_x: number;
  max_x: number;
  min_z: number;
  max_z: number;
}

export interface TrackGeometry {
  track_id: string;
  track_name: string;
  is_fallback: boolean;
  total_length_m: number;
  origin: Point2D;
  bounds: TrackBounds;
  centerline: Point2D[];
  bound_left: Point2D[];
  bound_right: Point2D[];
}

export interface CompetitorMeta {
  driver: string;
  car: string;
  reference_laptime: number | null;
}

export interface CarTelemetryFrame {
  x: number;
  z: number;
  speed_kmh: number;
  throttle_pct: number;
  brake_pct: number;
  steer_pct: number;
  gear: number;
  glat: number;
  glon: number;
  heading_rad: number;
  distance_m: number;
}

export interface SynchronizedFrame {
  t: number;
  car_a: CarTelemetryFrame;
  car_b: CarTelemetryFrame;
  separation_m: number;
}

export interface IncidentTimelineMarker {
  incident_id: string;
  timestamp: number;
  distance_m: number;
  slice_start: number;
  slice_end: number;
  is_primary: boolean;
}

export interface ActiveSlice {
  incident_id: string;
  incident_time: number;
  start_time: number;
  end_time: number;
  min_separation_m: number;
}

export interface SessionState {
  session_id: string;
  track_name: string;
  competitor_a: CompetitorMeta;
  competitor_b: CompetitorMeta;
  track: TrackGeometry;
  duration_s: number;
  sample_rate_hz: number;
  incident_markers: IncidentTimelineMarker[];
  active_slice: ActiveSlice | null;
  timeline: SynchronizedFrame[];
}

export interface IncidentStateVector {
  incident_id: string;
  timestamp: number;
  window_start: number;
  window_end: number;
  min_separation_m: number;
  closing_velocity_kmh: number;
  lateral_convergence_ms: number;
  overlap_ratio: number;
  along_track_gap_m: number;
  lateral_gap_m: number;
  has_contact: boolean;
  contact_time: number | null;
  contact_impulse_g: number;
  speed_attacker_kmh: number;
  speed_defender_kmh: number;
  delta_v_kmh: number;
  attacker_id: string;
  defender_id: string;
  attacker_driver: string;
  defender_driver: string;
  categorization: string;
  severity_score: number;
  telemetry_facts: Record<string, any>;
}

export interface TriageResult {
  incident_id: string;
  decision: string;
  fault_attribution: string;
  fault_driver: string | null;
  breach_category: string;
  rulebook_article: string;
  penalty_recommendation: string;
  confidence: number;
  justification: string;
  provider: string;
}

export interface StewardsBulletin {
  document_id: string;
  timestamp_utc: string;
  competition: string;
  event: string;
  session_name: string;
  headline: string;
  competitor_penalized: string | null;
  car_number: string | null;
  infringement: string;
  decision: string;
  time_penalty_seconds: number | null;
  penalty_points: number;
  facts: string;
  reasoning: string;
  signatories: string[];
  provider: string;
}
