"""
Layer 3: Judicial Steward Document Generator.
Powered by the canonical reusable Strands Decider + Amazon Bedrock Agent (Spec §6).
"""

import logging
from typing import Optional

from backend.app.ingest.schemas import SessionState
from backend.app.layer1_math.schemas import IncidentStateVector
from backend.app.layer2_gatekeeper.schemas import TriageResult
from backend.app.layer3_steward.schemas import StewardsBulletin
from reusable_agent.decider_agent import StrandsDeciderStewardsAgent, OFFICIAL_SIGNATORIES

logger = logging.getLogger("apexguard.steward")


class StewardService:
    def __init__(self, agent: Optional[StrandsDeciderStewardsAgent] = None):
        self.agent = agent or StrandsDeciderStewardsAgent()

    def generate_bulletin(
        self,
        session: SessionState,
        state: IncidentStateVector,
        triage: TriageResult
    ) -> StewardsBulletin:
        """
        Generates formal FIA Stewards' Decision Document using the reusable agent.
        """
        session_info = {
            "session_id": session.session_id,
            "track_name": session.track_name,
            "competitor_a": session.competitor_a.driver,
            "competitor_b": session.competitor_b.driver,
        }
        raw_bulletin = self.agent.generate_bulletin(
            session_info=session_info,
            state=state,
            triage=triage
        )
        return StewardsBulletin(
            document_id=raw_bulletin["document_id"],
            timestamp_utc=raw_bulletin["timestamp_utc"],
            competition=raw_bulletin.get("competition", "2026 FIA Formula One World Championship"),
            event=raw_bulletin.get("event", f"{session.track_name} Grand Prix"),
            session_name=raw_bulletin.get("session_name", "Race"),
            headline=raw_bulletin["headline"],
            competitor_penalized=raw_bulletin.get("competitor_penalized", triage.fault_driver),
            car_number=raw_bulletin.get("car_number"),
            infringement=raw_bulletin["infringement"],
            decision=raw_bulletin["decision"],
            time_penalty_seconds=raw_bulletin.get("time_penalty_seconds"),
            penalty_points=int(raw_bulletin.get("penalty_points", 0)),
            facts=raw_bulletin["facts"],
            reasoning=raw_bulletin["reasoning"],
            signatories=raw_bulletin.get("signatories", OFFICIAL_SIGNATORIES),
            provider=raw_bulletin.get("provider", "local_template_fallback"),
        )
