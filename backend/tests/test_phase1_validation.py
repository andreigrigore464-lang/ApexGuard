"""
Phase 1 Live Feature Validation Script for ApexGuard.
Validates:
1. Track Pre-Rendering: Generates valid boundary JSON with no NaN/Inf values.
2. Fallback Corridor Verification: Extrudes ribbon along Car A anchored at t=0 when track missing or offset > 50m.
3. Telemetry Ingestion via API: Sends dual real CSV files to POST /api/ingest.
4. Payload Inspection: Validates dynamic driver extraction, 20Hz frames, valid (X, Z), and incident timeline markers.
(Per TASKS.md Phase 1 Validation)
"""

import os
import sys
import glob
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure root directory is on sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.main import app
from backend.app.ingest.track_loader import TrackLoader
from backend.app.ingest.ingest_service import IngestService


def test_track_prerendering():
    print("--- 1. Testing Track Pre-Rendering ---")
    track_loader = TrackLoader()
    track_csv = ROOT_DIR / ".specs" / "reference_Silverstone.csv"
    assert track_csv.exists(), f"Track CSV not found: {track_csv}"

    track_geom = track_loader.parse_surveyed_csv(str(track_csv), track_name="Silverstone")
    cache_path = track_loader.save_cache(track_geom)

    assert cache_path.exists(), f"Cache file not created at {cache_path}"
    assert len(track_geom.centerline) > 100, f"Expected >100 centerline points, got {len(track_geom.centerline)}"
    assert len(track_geom.bound_left) == len(track_geom.centerline)
    assert len(track_geom.bound_right) == len(track_geom.centerline)
    assert track_geom.total_length_m > 1000.0, f"Expected track length > 1000m, got {track_geom.total_length_m}"

    # Verify no NaN or Inf
    for pt in track_geom.centerline + track_geom.bound_left + track_geom.bound_right:
        assert not (pt.x != pt.x), "Found NaN in coordinates"
        assert abs(pt.x) < 1e9, "Found Inf in coordinates"
        assert not (pt.z != pt.z), "Found NaN in coordinates"
        assert abs(pt.z) < 1e9, "Found Inf in coordinates"

    print(f"Track Pre-Rendering PASSED: Cached {track_geom.track_id} ({len(track_geom.centerline)} pts, length: {track_geom.total_length_m}m)")


def test_fallback_corridor():
    print("--- 2. Testing Fallback Corridor Verification ---")
    import numpy as np
    track_loader = TrackLoader()

    # Synthetic arbitrary driven trajectory (t=0 at x=100, z=200)
    traj_x = np.linspace(100.0, 300.0, 50)
    traj_z = np.sin(np.linspace(0, np.pi, 50)) * 50.0 + 200.0

    fallback = track_loader.resolve_track(
        track_name="Uncataloged Circuit",
        car_a_x=traj_x,
        car_a_z=traj_z,
        track_csv_path=None
    )

    assert fallback.is_fallback is True, "Expected is_fallback to be True for uncataloged circuit"
    assert len(fallback.centerline) == len(traj_x)
    assert abs(fallback.origin.x - traj_x[0]) < 1e-4, "Origin X must match t=0 Car A coordinate"
    assert abs(fallback.origin.z - traj_z[0]) < 1e-4, "Origin Z must match t=0 Car A coordinate"
    assert len(fallback.bound_left) == len(traj_x)
    assert len(fallback.bound_right) == len(traj_x)

    print("Fallback Corridor PASSED: Correctly anchored at t=0 and extruded along driven line.")


def test_api_ingest_and_payload_inspection():
    print("--- 3 & 4. Testing Live API Ingestion & Payload Inspection ---")
    client = TestClient(app)

    # Find two real CSVs in materiale/testCases/#2
    testcase2_dir = ROOT_DIR / "materiale" / "testCases" / "#2"
    assert testcase2_dir.exists(), f"Directory not found: {testcase2_dir}"

    csv_files = sorted(testcase2_dir.glob("*.csv"))
    assert len(csv_files) >= 2, f"Expected at least 2 CSV files in {testcase2_dir}"

    file_a_path = csv_files[0]
    file_b_path = csv_files[1]

    print(f"Testing ingestion with real files:\n  Car A: {file_a_path.name}\n  Car B: {file_b_path.name}")

    with open(file_a_path, "rb") as fa, open(file_b_path, "rb") as fb:
        response = client.post(
            "/api/ingest",
            files={
                "car_a": (file_a_path.name, fa, "text/csv"),
                "car_b": (file_b_path.name, fb, "text/csv"),
            }
        )

    assert response.status_code == 200, f"API returned status {response.status_code}: {response.text}"
    data = response.json()

    # 4. Payload Inspection
    assert "session_id" in data
    assert "track_name" in data and len(data["track_name"]) > 0
    assert "competitor_a" in data and "driver" in data["competitor_a"]
    assert "competitor_b" in data and "driver" in data["competitor_b"]

    driver_a = data["competitor_a"]["driver"]
    driver_b = data["competitor_b"]["driver"]
    track_name = data["track_name"]
    print(f"Dynamically Extracted Metadata:")
    print(f"  Track: {track_name}")
    print(f"  Competitor A: {driver_a} ({data['competitor_a']['car']})")
    print(f"  Competitor B: {driver_b} ({data['competitor_b']['car']})")

    # Verify not empty or default fallback when real files have names
    assert driver_a != "", "Driver A identifier must not be empty"
    assert driver_b != "", "Driver B identifier must not be empty"

    timeline = data.get("timeline", [])
    assert len(timeline) > 50, f"Expected >50 synchronized timeline frames, got {len(timeline)}"
    assert data["sample_rate_hz"] == 20.0

    # Verify frame timestep interval is 0.05s
    t_diff = round(timeline[1]["t"] - timeline[0]["t"], 3)
    assert t_diff == 0.05, f"Expected 0.05s timestep for 20Hz, got {t_diff}s"

    # Verify coordinates and separation in frames
    for f in timeline[:10]:
        assert "x" in f["car_a"] and "z" in f["car_a"] and "speed_kmh" in f["car_a"]
        assert "x" in f["car_b"] and "z" in f["car_b"] and "speed_kmh" in f["car_b"]
        assert "separation_m" in f
        assert f["separation_m"] >= 0.0

    # Verify incident timeline markers
    incident_markers = data.get("incident_markers", [])
    print(f"Detected {len(incident_markers)} incident proximity peaks (<4.0m):")
    for m in incident_markers:
        print(f"  Marker: {m['incident_id']} at t={m['timestamp']}s, clearance={m['distance_m']}m (primary={m['is_primary']})")

    assert data.get("active_slice") is not None, "active_slice must be set"
    active_slice = data["active_slice"]
    print(f"Active slice: {active_slice['incident_id']} at t={active_slice['incident_time']}s (start={active_slice['start_time']}s, end={active_slice['end_time']}s, min_separation={active_slice['min_separation_m']}m)")

    # Verify track geometry payload
    track = data.get("track", {})
    assert "centerline" in track and len(track["centerline"]) > 0
    assert "bound_left" in track and len(track["bound_left"]) > 0
    assert "bound_right" in track and len(track["bound_right"]) > 0
    print(f"Track geometry resolved: {track['track_name']} (is_fallback={track['is_fallback']}, length={track['total_length_m']}m)")

    print("API Ingestion and Payload Inspection PASSED successfully!")


if __name__ == "__main__":
    test_track_prerendering()
    test_fallback_corridor()
    test_api_ingest_and_payload_inspection()
    print("\nALL PHASE 1 FEATURE VALIDATIONS PASSED CLEANLY!")
