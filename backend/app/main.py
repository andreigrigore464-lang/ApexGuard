"""
ApexGuard FastAPI Application Entrypoint.
Exposes ingestion and review pipeline endpoints per PROJECT_SPEC.md.
"""

import os
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any
from pydantic import BaseModel, Field
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.ingest.schemas import SessionState, TrackGeometry
from backend.app.ingest.ingest_service import IngestService
from backend.app.ingest.track_loader import TrackLoader, DEFAULT_TRACKS_DIR
from backend.app.layer1_math.schemas import IncidentStateVector
from backend.app.layer1_math.kinematics import compute_kinematics
from backend.app.layer2_gatekeeper.schemas import TriageResult
from backend.app.layer2_gatekeeper.gatekeeper_service import GatekeeperService
from backend.app.layer3_steward.schemas import StewardsBulletin
from backend.app.layer3_steward.steward_service import StewardService

app = FastAPI(
    title="ApexGuard API",
    description="Deterministic Motorsport Telemetry Incident Review & Rulebook Governance Platform",
    version="1.0.0",
)

# CORS configuration for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Singleton service instances
track_loader = TrackLoader()
ingest_service = IngestService(track_loader=track_loader)
gatekeeper_service = GatekeeperService()
steward_service = StewardService()


# Request / Response Schemas
class AnalyzeRequest(BaseModel):
    session: SessionState = Field(..., description="Ingested session state JSON")
    incident_id: Optional[str] = Field(None, description="Target incident peak ID")
    time_window: Optional[Tuple[float, float]] = Field(None, description="Explicit [start, end] time window in seconds")


class BulletinRequest(BaseModel):
    session: SessionState
    state: IncidentStateVector
    triage: TriageResult


class FullReviewResponse(BaseModel):
    kinematics: IncidentStateVector
    triage: TriageResult
    bulletin: StewardsBulletin


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "ApexGuard Engine", "version": "1.0.0"}


@app.post("/api/ingest", response_model=SessionState)
async def ingest_telemetry(
    car_a: UploadFile = File(..., description="CSV telemetry for Competitor A"),
    car_b: UploadFile = File(..., description="CSV telemetry for Competitor B"),
    track_csv: Optional[UploadFile] = File(None, description="Optional surveyed track geometry CSV"),
    track_id: Optional[str] = Form(None, description="Optional selected canonical track ID or 'fallback'"),
):
    """
    Ingests dual car telemetry CSV files, resamples onto a synchronized 20Hz grid,
    calculates continuous separation, discovers candidate incidents, and returns
    the normalized SessionState. (Spec §1.2, §2.1)
    """
    try:
        content_a_bytes = await car_a.read()
        content_b_bytes = await car_b.read()

        car_a_str = content_a_bytes.decode("utf-8", errors="ignore")
        car_b_str = content_b_bytes.decode("utf-8", errors="ignore")

        track_csv_str: Optional[str] = None
        if track_csv is not None:
            track_bytes = await track_csv.read()
            track_csv_str = track_bytes.decode("utf-8", errors="ignore")

        session_state = ingest_service.process_telemetry(
            car_a_csv=car_a_str,
            car_b_csv=car_b_str,
            track_csv=track_csv_str,
            track_id=track_id,
        )
        return session_state
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Telemetry processing failed: {str(e)}"
        )


@app.post("/api/telemetry/analyze", response_model=IncidentStateVector)
def analyze_telemetry_kinematics(req: AnalyzeRequest):
    """
    Layer 1: Deterministic Physics Math (<4ms).
    Computes relative longitudinal motion (closing velocity), lateral convergence,
    chassis overlap ratio, and contact impulses per Spec §6.
    """
    try:
        state_vector = compute_kinematics(
            session=req.session,
            incident_id=req.incident_id,
            time_window=req.time_window
        )
        return state_vector
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Kinematic analysis failed: {str(e)}"
        )


@app.post("/api/triage", response_model=TriageResult)
async def triage_incident_gatekeeper(state: IncidentStateVector):
    """
    Layer 2: Rulebook Gating (~115ms).
    Evaluates kinematic state vector against active rulebook JSON using
    Strands Decider 2B (cloud) or local deterministic rulebook evaluator (offline).
    """
    try:
        result = await gatekeeper_service.triage_incident(state)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Rulebook triage failed: {str(e)}"
        )


@app.post("/api/bulletin", response_model=StewardsBulletin)
def generate_stewards_bulletin(req: BulletinRequest):
    """
    Layer 3: Judicial Steward Document Generator (~1.5s).
    Generates formal FIA Stewards' Decision Document citing dynamic session details
    using Amazon Bedrock (cloud) or local judicial template fallback (offline).
    """
    try:
        bulletin = steward_service.generate_bulletin(
            session=req.session,
            state=req.state,
            triage=req.triage
        )
        return bulletin
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stewards bulletin generation failed: {str(e)}"
        )


@app.post("/api/pipeline/review", response_model=FullReviewResponse)
async def run_full_governance_pipeline(req: AnalyzeRequest):
    """
    End-to-End Governance Pipeline:
    Executes Layer 1 (Math) -> Layer 2 (Gating) -> Layer 3 (Steward Document).
    """
    try:
        kinematics = compute_kinematics(
            session=req.session,
            incident_id=req.incident_id,
            time_window=req.time_window
        )
        triage = await gatekeeper_service.triage_incident(kinematics)
        bulletin = steward_service.generate_bulletin(
            session=req.session,
            state=kinematics,
            triage=triage
        )
        return FullReviewResponse(
            kinematics=kinematics,
            triage=triage,
            bulletin=bulletin
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Full review pipeline failed: {str(e)}"
        )


@app.post("/api/tracks/prerender", response_model=TrackGeometry)
async def prerender_track(
    track_name: str = Form(..., description="Circuit name"),
    track_csv: UploadFile = File(..., description="4-column surveyed track CSV"),
):
    """
    Parses surveyed track CSV, extrudes 2D unit normal boundaries,
    and saves to pre-rendered JSON cache. (Spec §3.1, §3.2)
    """
    try:
        content_bytes = await track_csv.read()
        csv_str = content_bytes.decode("utf-8", errors="ignore")
        track_geom = track_loader.parse_surveyed_csv(csv_str, track_name=track_name)
        track_loader.save_cache(track_geom)
        return track_geom
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Track extrusion failed: {str(e)}"
        )


@app.get("/api/samples")
def list_available_samples():
    """Lists available real test cases from disk per Spec §8."""
    workspace_root = Path(__file__).resolve().parent.parent.parent
    samples = []
    
    tc2 = workspace_root / "materiale" / "testCases" / "#2"
    if tc2.exists():
        samples.append({
            "id": "brazil_turn4",
            "name": "Brazil Interlagos — Turn 4 Battle",
            "circuit": "Autódromo José Carlos Pace (Interlagos)",
            "track_id": "sao_paulo",
            "car_a": "Mercedes (Russell)",
            "car_b": "Ferrari (Hamilton)",
            "has_video": (tc2 / "F1 25_2026.10.17-17.29.mp4").exists(),
            "video_path": "/api/media/brazil",
        })

    tc1 = workspace_root / "materiale" / "testCases" / "#1"
    if tc1.exists():
        samples.append({
            "id": "silverstone_battle",
            "name": "Silverstone Circuit — Opening Lap Encounter",
            "circuit": "Silverstone Circuit",
            "track_id": "silverstone",
            "car_a": "McLaren (Norris)",
            "car_b": "Ferrari (Leclerc)",
            "has_video": (tc1 / "F1 25_2026.10.17-16.31.mp4").exists(),
            "video_path": "/api/media/silverstone",
        })

    return samples


@app.post("/api/samples/{sample_id}/load", response_model=SessionState)
def load_sample_session(sample_id: str):
    """
    Executes live ingestion against real sample files on disk (Spec §8).
    Ensures 100% of testing flows through the real ingest pipeline without mock fixtures.
    """
    workspace_root = Path(__file__).resolve().parent.parent.parent
    
    target_track_id: Optional[str] = None
    if sample_id == "brazil_turn4":
        tc_dir = workspace_root / "materiale" / "testCases" / "#2"
        file_a = tc_dir / "brazil_R_90.478_mercedes_rus_L1_2026-10-17_opponent.csv"
        file_b = tc_dir / "brazil_R_91.558_ferrari.csv"
        target_track_id = "sao_paulo"
    elif sample_id == "silverstone_battle":
        tc_dir = workspace_root / "materiale" / "testCases" / "#1"
        file_a = tc_dir / "silverstone_R_94.768_mclaren_nor_L1_2026-10-17_opponent.csv"
        file_b = tc_dir / "silverstone_R_98.030_ferrari_lec_L1_2026-10-17_opponent.csv"
        target_track_id = "silverstone"
    else:
        raise HTTPException(status_code=404, detail=f"Sample '{sample_id}' not found")

    if not file_a.exists() or not file_b.exists():
        raise HTTPException(status_code=404, detail=f"Sample telemetry files missing on disk: {file_a}, {file_b}")

    content_a = file_a.read_text(encoding="utf-8", errors="ignore")
    content_b = file_b.read_text(encoding="utf-8", errors="ignore")

    # Ingest through the real live service with matched surveyed track
    return ingest_service.process_telemetry(content_a, content_b, track_id=target_track_id)


@app.get("/api/media/{case_id}")
def stream_incident_video(case_id: str):
    """
    Streams recorded incident MP4 footage for synchronized video playback (Spec §4.2, §7.2).
    """
    from fastapi.responses import FileResponse
    workspace_root = Path(__file__).resolve().parent.parent.parent

    if case_id in ("brazil", "brazil_turn4"):
        video_path = workspace_root / "materiale" / "testCases" / "#2" / "F1 25_2026.10.17-17.29.mp4"
    elif case_id in ("silverstone", "silverstone_battle"):
        video_path = workspace_root / "materiale" / "testCases" / "#1" / "F1 25_2026.10.17-16.31.mp4"
    else:
        raise HTTPException(status_code=404, detail=f"Media case '{case_id}' not found")

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Incident video file not found on disk")

    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=video_path.name
    )


class TrackManifestItem(BaseModel):
    track_id: str
    track_name: str
    country: str
    total_length_m: float
    aliases: List[str]


@app.get("/api/tracks", response_model=List[TrackManifestItem])
def list_canonical_tracks():
    """Lists all 25 canonical surveyed racetracks with metadata."""
    manifest = track_loader.get_manifest()
    return manifest


@app.get("/api/tracks/{track_id}", response_model=TrackGeometry)
def get_cached_track(track_id: str):
    """Retrieves pre-rendered track geometry from cache."""
    track = track_loader.load_cache(track_id)
    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track '{track_id}' not found in pre-rendered cache"
        )
    return track


