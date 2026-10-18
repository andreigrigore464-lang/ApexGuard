"""
Layer 3: Judicial Steward Document Generator.
Generates official, print-ready FIA Stewards' Decision Documents using Amazon Bedrock
when credentials are provided in .env, with a deterministic local template fallback.
(See Spec §6)
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from backend.app.config import settings
from backend.app.ingest.schemas import SessionState
from backend.app.layer1_math.schemas import IncidentStateVector
from backend.app.layer2_gatekeeper.schemas import TriageResult
from backend.app.layer3_steward.schemas import StewardsBulletin

logger = logging.getLogger("apexguard.steward")

OFFICIAL_SIGNATORIES = [
    "Gerd Ennser (FIA Chairman of the Stewards)",
    "Dennis Dean (FIA International Steward)",
    "Vitantonio Liuzzi (FIA Driver Steward)",
    "Nish Shetty (National Steward)",
]


class StewardService:
    def generate_bulletin(
        self,
        session: SessionState,
        state: IncidentStateVector,
        triage: TriageResult
    ) -> StewardsBulletin:
        """
        Generates formal FIA Stewards' Decision Document.
        If AWS Bedrock credentials exist in .env, invokes Bedrock LLM.
        Otherwise executes local template fallback.
        """
        if settings.has_bedrock_credentials:
            try:
                return self._call_bedrock(session, state, triage)
            except Exception as e:
                logger.warning(f"Amazon Bedrock call failed ({e}); using local judicial template fallback.")
                return self._generate_local_template(session, state, triage)
        else:
            return self._generate_local_template(session, state, triage)

    def _call_bedrock(
        self,
        session: SessionState,
        state: IncidentStateVector,
        triage: TriageResult
    ) -> StewardsBulletin:
        """Calls Amazon Bedrock runtime API to generate judicial bulletin."""
        import boto3

        client = boto3.client(
            "bedrock-runtime",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )

        prompt_system = (
            "You are the Panel of FIA Stewards of the Meeting for Formula One. "
            "Draft a formal, print-ready FIA Stewards' Decision Document based strictly on the provided "
            "incident facts, triage decision, and telemetry vector. Use standard official FIA legal formatting. "
            "Respond ONLY with valid JSON matching: "
            "{\"document_id\": string, \"headline\": string, \"competitor_penalized\": string, "
            "\"infringement\": string, \"decision\": string, \"time_penalty_seconds\": float or null, "
            "\"penalty_points\": int, \"facts\": string, \"reasoning\": string}"
        )

        user_content = json.dumps({
            "session_id": session.session_id,
            "track": session.track_name,
            "competitor_a": session.competitor_a.model_dump(),
            "competitor_b": session.competitor_b.model_dump(),
            "kinematic_state": state.model_dump(),
            "triage_result": triage.model_dump(),
        })

        model_id = settings.bedrock_model_id

        # Format request payload according to provider model family
        if "anthropic.claude" in model_id:
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "temperature": 0.1,
                "system": prompt_system,
                "messages": [{"role": "user", "content": user_content}]
            })
        else:
            # Generic / Titan fallback format
            body = json.dumps({
                "inputText": f"{prompt_system}\n\nUser Data: {user_content}",
                "textGenerationConfig": {"maxTokenCount": 1000, "temperature": 0.1}
            })

        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

        response_body = json.loads(response["body"].read())

        if "anthropic.claude" in model_id:
            text = response_body["content"][0]["text"]
        else:
            text = response_body.get("results", [{}])[0].get("outputText", "{}")

        parsed = json.loads(text)
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        return StewardsBulletin(
            document_id=parsed.get("document_id", f"DOC-2026-{abs(hash(session.session_id)) % 900 + 100}"),
            timestamp_utc=now_utc,
            competition="2026 FIA Formula One World Championship",
            event=f"{session.track_name} Grand Prix",
            session_name="Race",
            headline=parsed.get("headline", f"OFFICIAL DECISION: {triage.decision}"),
            competitor_penalized=parsed.get("competitor_penalized", triage.fault_driver),
            infringement=parsed.get("infringement", triage.rulebook_article),
            decision=parsed.get("decision", triage.penalty_recommendation),
            time_penalty_seconds=parsed.get("time_penalty_seconds", 10.0 if "10-Second" in triage.penalty_recommendation else (5.0 if "5-Second" in triage.penalty_recommendation else None)),
            penalty_points=int(parsed.get("penalty_points", 2 if "2 Penalty" in triage.penalty_recommendation else 1)),
            facts=parsed.get("facts", triage.justification),
            reasoning=parsed.get("reasoning", "The Stewards examined synchronized telemetry data and video evidence."),
            signatories=OFFICIAL_SIGNATORIES,
            provider="amazon_bedrock",
        )

    def _generate_local_template(
        self,
        session: SessionState,
        state: IncidentStateVector,
        triage: TriageResult
    ) -> StewardsBulletin:
        """Deterministic local template fallback generating formal FIA decision bulletin."""
        doc_num = abs(hash(session.session_id + state.incident_id)) % 900 + 100
        doc_id = f"DOC-2026-{doc_num:03d}"
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        event_name = f"{session.track_name} Grand Prix"

        penalized_driver = triage.fault_driver
        is_infringement = triage.decision == "INFRINGEMENT"

        time_penalty: Optional[float] = None
        penalty_pts = 0

        if "10-Second" in triage.penalty_recommendation:
            time_penalty = 10.0
            penalty_pts = 2
        elif "5-Second" in triage.penalty_recommendation:
            time_penalty = 5.0
            penalty_pts = 1

        if is_infringement and penalized_driver:
            headline = f"DECISION: CAR ({penalized_driver.upper()}) PENALTY"
        else:
            headline = "DECISION: RACING INCIDENT — NO FURTHER ACTION"

        # Format physical facts
        contact_str = f"Physical contact was established at t={state.contact_time:.2f}s with a peak impulse jerk of {state.contact_impulse_g:.2f} G/s." if state.has_contact else "No physical chassis rupture was detected."
        facts = (
            f"At timestamp t={state.timestamp:.2f}s during the session, Car {state.attacker_driver} and Car {state.defender_driver} "
            f"converged to a minimum center separation of {state.min_separation_m:.2f}m. Synchronized 20Hz telemetry recorded "
            f"a longitudinal closing velocity of {state.closing_velocity_kmh:.1f} km/h, an along-track gap of {state.along_track_gap_m:.2f}m, "
            f"and a lateral clearance of {state.lateral_gap_m:.2f}m. Lateral convergence rate was {state.lateral_convergence_ms:.2f} m/s "
            f"with a chassis overlap ratio of {state.overlap_ratio * 100:.1f}%. {contact_str}"
        )

        # Formal judicial reasoning
        if is_infringement and penalized_driver:
            reasoning = (
                f"The Stewards reviewed telemetry data, tracking radar projections, and GPS coordinate feeds. "
                f"The evidence demonstrates that Car {penalized_driver} was wholly or predominantly to blame for the incident. "
                f"{triage.justification} "
                f"The Stewards determine that this constitutes a breach of {triage.rulebook_article}. Competitors are reminded "
                f"that they have the right to appeal certain decisions of the Stewards, in accordance with Article 15 of the "
                f"FIA International Sporting Code and Chapter 4 of the FIA Judicial and Disciplinary Rules, within the applicable time limits."
            )
        else:
            reasoning = (
                f"The Stewards examined synchronized multi-channel telemetry and kinematic radar vectors. "
                f"Having considered the matter extensively, the Stewards determine that both drivers exercised reasonable "
                f"car control and neither driver was wholly or predominantly to blame. The incident is classified as a genuine "
                f"first-lap / wheel-to-wheel racing contest under {triage.rulebook_article}. Accordingly, no further action is taken."
            )

        return StewardsBulletin(
            document_id=doc_id,
            timestamp_utc=now_utc,
            competition="2026 FIA Formula One World Championship",
            event=event_name,
            session_name="Race",
            headline=headline,
            competitor_penalized=penalized_driver if is_infringement else None,
            car_number=None,
            infringement=triage.rulebook_article,
            decision=triage.penalty_recommendation,
            time_penalty_seconds=time_penalty,
            penalty_points=penalty_pts,
            facts=facts,
            reasoning=reasoning,
            signatories=OFFICIAL_SIGNATORIES,
            provider="local_template_fallback",
        )
