/**
 * API client for communicating with ApexGuard FastAPI backend.
 */

import {
  SessionState,
  IncidentStateVector,
  TriageResult,
  StewardsBulletin,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface TrackMeta {
  track_id: string;
  track_name: string;
  country: string;
  total_length_m: number;
  aliases: string[];
}

export async function listTracks(): Promise<TrackMeta[]> {
  const res = await fetch(`${API_BASE}/api/tracks`);
  if (!res.ok) return [];
  return res.json();
}

export async function ingestTelemetry(
  fileA: File,
  fileB: File,
  trackFile?: File,
  trackId?: string
): Promise<SessionState> {
  const formData = new FormData();
  formData.append("car_a", fileA);
  formData.append("car_b", fileB);
  if (trackFile) {
    formData.append("track_csv", trackFile);
  }
  if (trackId && trackId !== "auto") {
    formData.append("track_id", trackId);
  }

  const res = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ingestion failed" }));
    throw new Error(err.detail || "Telemetry ingestion failed");
  }

  return res.json();
}

export async function analyzeKinematics(
  session: SessionState,
  incidentId?: string
): Promise<IncidentStateVector> {
  const res = await fetch(`${API_BASE}/api/telemetry/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, incident_id: incidentId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Analysis failed" }));
    throw new Error(err.detail || "Kinematic analysis failed");
  }

  return res.json();
}

export async function triageIncident(
  state: IncidentStateVector
): Promise<TriageResult> {
  const res = await fetch(`${API_BASE}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Triage failed" }));
    throw new Error(err.detail || "Rulebook triage failed");
  }

  return res.json();
}

export async function generateBulletin(
  session: SessionState,
  state: IncidentStateVector,
  triage: TriageResult
): Promise<StewardsBulletin> {
  const res = await fetch(`${API_BASE}/api/bulletin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, state, triage }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Bulletin failed" }));
    throw new Error(err.detail || "Bulletin generation failed");
  }

  return res.json();
}

export async function runFullPipeline(
  session: SessionState,
  incidentId?: string
): Promise<{
  kinematics: IncidentStateVector;
  triage: TriageResult;
  bulletin: StewardsBulletin;
}> {
  const res = await fetch(`${API_BASE}/api/pipeline/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, incident_id: incidentId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Pipeline review failed" }));
    throw new Error(err.detail || "Pipeline review failed");
  }

  return res.json();
}

export interface SampleMeta {
  id: string;
  name: string;
  circuit: string;
  car_a: string;
  car_b: string;
  has_video: boolean;
  video_path?: string;
}

export async function listSamples(): Promise<SampleMeta[]> {
  const res = await fetch(`${API_BASE}/api/samples`);
  if (!res.ok) return [];
  return res.json();
}

export async function loadSample(sampleId: string): Promise<SessionState> {
  const res = await fetch(`${API_BASE}/api/samples/${sampleId}/load`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load sample" }));
    throw new Error(err.detail || "Failed to load sample");
  }

  return res.json();
}
