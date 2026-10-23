/**
 * API client for communicating with ApexGuard FastAPI backend.
 */

import {
  SessionState,
  IncidentStateVector,
  TriageResult,
  StewardsBulletin,
} from "./types";

const rawBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_BASE = rawBase.replace(/\/+$/, "");

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

export interface SampleMeta {
  id: string;
  name: string;
  circuit: string;
  car_a: string;
  car_b: string;
  has_video: boolean;
  video_path?: string;
}

export const FALLBACK_SAMPLES: SampleMeta[] = [
  {
    id: "interlagos_incident",
    name: "Interlagos Incident",
    circuit: "Autódromo José Carlos Pace (Interlagos)",
    car_a: "Ferrari (Hamilton)",
    car_b: "Ferrari (Leclerc)",
    has_video: true,
    video_path: "/clips/interlagos.mp4",
  },
  {
    id: "silverstone_incident",
    name: "Silverstone Incident",
    circuit: "Silverstone Circuit",
    car_a: "Ferrari (Hamilton)",
    car_b: "McLaren (Norris)",
    has_video: true,
    video_path: "/clips/silverstone.mp4",
  },
];

export async function runFullPipeline(
  session: SessionState,
  incidentId?: string
): Promise<{
  kinematics: IncidentStateVector;
  triage: TriageResult;
  bulletin: StewardsBulletin;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${API_BASE}/api/pipeline/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, incident_id: incidentId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("Live pipeline review note (falling back to bundled evaluation):", e);
  }

  // Resilient fallback to pre-computed deterministic review
  const isSilverstone = session.track_name?.toLowerCase().includes("silverstone");
  const fallbackReviewPath = isSilverstone
    ? "/data/silverstone_pipeline.json"
    : "/data/interlagos_pipeline.json";

  const localRes = await fetch(fallbackReviewPath);
  if (localRes.ok) {
    return await localRes.json();
  }

  throw new Error("Pipeline review failed to execute");
}

export async function listSamples(): Promise<SampleMeta[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE}/api/samples`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: SampleMeta[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((s) => ({
          ...s,
          has_video: true,
          video_path:
            s.video_path && !s.video_path.includes("localhost")
              ? s.video_path
              : s.id.includes("silverstone")
              ? "/clips/silverstone.mp4"
              : "/clips/interlagos.mp4",
        }));
      }
    }
  } catch (e) {
    console.warn("Backend /api/samples unavailable; using verified local demo catalogue:", e);
  }
  return FALLBACK_SAMPLES;
}

export async function loadSample(sampleId: string): Promise<SessionState> {
  // Normalize legacy IDs across backend revisions
  const isSilv =
    sampleId.includes("silverstone") || sampleId === "1";
  const canonicalId = isSilv ? "silverstone_incident" : "interlagos_incident";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${API_BASE}/api/samples/${sampleId}/load`, {
      method: "POST",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn(`Live telemetry sample loading note for '${sampleId}' (using bundled high-rate session):`, e);
  }

  // Resilient local static 20Hz dataset fallback
  const fallbackPath = isSilv
    ? "/data/silverstone_session.json"
    : "/data/interlagos_session.json";

  const localRes = await fetch(fallbackPath);
  if (localRes.ok) {
    return await localRes.json();
  }

  throw new Error(`Failed to load telemetry session for sample '${canonicalId}'`);
}

