"""
Phase 2 Live Feature Validation Script for ApexGuard.
Validates:
1. Kinematics Calculation: Layer 1 physical relative motion vectors (v_close, v_lat, overlap, min separation).
2. Breach Classification: Dynamic categorization from physical kinematics.
3. Rulebook Gating & Fallback: Layer 2 evaluation with and without API keys (Strands Decider 2B vs Local Evaluator).
4. Stewards' Decision Generation: Layer 3 formal FIA Decision Document with and without Bedrock credentials.
5. End-to-End Governance Pipeline: POST /api/pipeline/review.
(Per TASKS.md Phase 2 Validation)
"""

import os
import sys
from pathlib import Path
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.main import app
from backend.app.config import settings
from backend.app.layer1_math.kinematics import compute_kinematics
from backend.app.layer2_gatekeeper.gatekeeper_service import GatekeeperService
from backend.app.layer3_steward.steward_service import StewardService


def get_live_session():
    """Ingests real files from testCases #2 to obtain dynamic session."""
    client = TestClient(app)
    testcase2_dir = ROOT_DIR / "materiale" / "testCases" / "#2"
    csv_files = sorted(testcase2_dir.glob("*.csv"))
    assert len(csv_files) >= 2

    with open(csv_files[0], "rb") as fa, open(csv_files[1], "rb") as fb:
        resp = client.post(
            "/api/ingest",
            files={
                "car_a": (csv_files[0].name, fa, "text/csv"),
                "car_b": (csv_files[1].name, fb, "text/csv"),
            }
        )
    assert resp.status_code == 200, f"Ingest failed: {resp.text}"
    return resp.json()


def test_phase2_kinematics_and_governance():
    client = TestClient(app)
    print("Ingesting live test session for Phase 2 validation...")
    session_data = get_live_session()

    print(f"Session: {session_data['session_id']}")
    print(f"Competitor A: {session_data['competitor_a']['driver']} ({session_data['competitor_a']['car']})")
    print(f"Competitor B: {session_data['competitor_b']['driver']} ({session_data['competitor_b']['car']})")
    print(f"Detected {len(session_data['incident_markers'])} proximity peaks.")

    # 1. Kinematics Calculation (Layer 1 via POST /api/telemetry/analyze)
    print("\n--- 1 & 2. Testing Layer 1 Kinematic Engine ---")
    analyze_resp = client.post(
        "/api/telemetry/analyze",
        json={"session": session_data}
    )
    assert analyze_resp.status_code == 200, f"Analyze failed: {analyze_resp.text}"
    state = analyze_resp.json()

    print(f"Incident ID: {state['incident_id']} at t={state['timestamp']}s")
    print(f"  Min Separation: {state['min_separation_m']}m")
    print(f"  Closing Velocity: {state['closing_velocity_kmh']} km/h")
    print(f"  Lateral Convergence: {state['lateral_convergence_ms']} m/s")
    print(f"  Overlap Ratio: {state['overlap_ratio'] * 100:.1f}%")
    print(f"  Along-Track Gap: {state['along_track_gap_m']}m")
    print(f"  Lateral Gap: {state['lateral_gap_m']}m")
    print(f"  Attacker: {state['attacker_driver']} ({state['attacker_id']})")
    print(f"  Defender: {state['defender_driver']} ({state['defender_id']})")
    print(f"  Contact Detected: {state['has_contact']}")
    print(f"  Categorization: {state['categorization']}")

    assert state["min_separation_m"] > 0.0
    assert 0.0 <= state["overlap_ratio"] <= 1.0
    assert state["categorization"] in ["REAR_END_SHUNT", "APEX_DIVEBOMB", "CROWD_SQUEEZE", "RACING_INCIDENT"]
    print("Layer 1 Kinematic Vector PASSED!")

    # 2. Rulebook Gating & Fallback (Layer 2 via POST /api/triage)
    print("\n--- 3. Testing Layer 2 Rulebook Gating (Offline Fallback) ---")
    triage_resp = client.post("/api/triage", json=state)
    assert triage_resp.status_code == 200, f"Triage failed: {triage_resp.text}"
    triage = triage_resp.json()

    print(f"Triage Decision: {triage['decision']}")
    print(f"  Fault Attribution: {triage['fault_attribution']} ({triage['fault_driver']})")
    print(f"  Breach Category: {triage['breach_category']}")
    print(f"  Rulebook Article: {triage['rulebook_article']}")
    print(f"  Recommended Penalty: {triage['penalty_recommendation']}")
    print(f"  Provider: {triage['provider']}")
    print(f"  Justification: {triage['justification'][:120]}...")

    assert triage["provider"] == "local_deterministic_fallback"
    assert triage["decision"] in ["INFRINGEMENT", "RACING_INCIDENT"]
    assert triage["confidence"] > 0.5
    print("Layer 2 Offline Fallback PASSED!")

    # Test dynamic credential detection for Layer 2
    print("\n--- Testing Layer 2 Dynamic Credential Activation ---")
    os.environ["STRANDS_API_KEY"] = "sk_strands_test_dummy_key_12345"
    try:
        assert settings.has_strands_credentials is True
        print("Dynamic credential detection confirmed: has_strands_credentials=True when env var added.")
    finally:
        del os.environ["STRANDS_API_KEY"]
    assert settings.has_strands_credentials is False
    print("Layer 2 Dynamic Credential Gating PASSED!")

    # 3. Stewards' Decision Generation (Layer 3 via POST /api/bulletin)
    print("\n--- 4. Testing Layer 3 Judicial Steward (Offline Fallback) ---")
    bulletin_resp = client.post(
        "/api/bulletin",
        json={
            "session": session_data,
            "state": state,
            "triage": triage
        }
    )
    assert bulletin_resp.status_code == 200, f"Bulletin failed: {bulletin_resp.text}"
    bulletin = bulletin_resp.json()

    print(f"Document ID: {bulletin['document_id']}")
    print(f"Headline: {bulletin['headline']}")
    print(f"Event: {bulletin['event']}")
    print(f"Infringement: {bulletin['infringement']}")
    print(f"Decision: {bulletin['decision']}")
    print(f"Provider: {bulletin['provider']}")
    print(f"Facts: {bulletin['facts'][:100]}...")
    print(f"Reasoning: {bulletin['reasoning'][:100]}...")
    print(f"Signatories ({len(bulletin['signatories'])}): {bulletin['signatories'][0]}")

    assert bulletin["provider"] == "local_template_fallback"
    assert bulletin["document_id"].startswith("DOC-2026-")
    assert len(bulletin["signatories"]) == 4
    # Ensure dynamic driver name is cited
    assert session_data["competitor_a"]["driver"] in bulletin["facts"] or session_data["competitor_b"]["driver"] in bulletin["facts"]
    print("Layer 3 Offline Fallback PASSED!")

    # Test dynamic credential detection for Layer 3
    print("\n--- Testing Layer 3 Dynamic Bedrock Credential Activation ---")
    os.environ["AWS_ACCESS_KEY_ID"] = "AKIA_DUMMY_KEY_TEST_12345"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "SECRET_DUMMY_KEY_TEST_12345"
    try:
        assert settings.has_bedrock_credentials is True
        print("Dynamic credential detection confirmed: has_bedrock_credentials=True when env vars added.")
    finally:
        del os.environ["AWS_ACCESS_KEY_ID"]
        del os.environ["AWS_SECRET_ACCESS_KEY"]
    assert settings.has_bedrock_credentials is False
    print("Layer 3 Dynamic Credential Gating PASSED!")

    # 4. Full End-to-End Governance Pipeline (POST /api/pipeline/review)
    print("\n--- 5. Testing End-to-End Governance Pipeline Endpoint ---")
    pipeline_resp = client.post(
        "/api/pipeline/review",
        json={"session": session_data}
    )
    assert pipeline_resp.status_code == 200, f"Pipeline failed: {pipeline_resp.text}"
    pipeline_data = pipeline_resp.json()
    assert "kinematics" in pipeline_data
    assert "triage" in pipeline_data
    assert "bulletin" in pipeline_data
    print("End-to-End Governance Pipeline PASSED cleanly!")


if __name__ == "__main__":
    test_phase2_kinematics_and_governance()
    print("\nALL PHASE 2 FEATURE VALIDATIONS PASSED CLEANLY!")
