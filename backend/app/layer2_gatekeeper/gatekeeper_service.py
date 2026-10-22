"""
Layer 2: Policy & Rulebook Gatekeeper Service.
Powered by the canonical reusable Strands Decider 2B Agent (Spec §6).
"""

import logging
from typing import Optional

from backend.app.layer1_math.schemas import IncidentStateVector
from backend.app.layer2_gatekeeper.schemas import TriageResult
from reusable_agent.decider_agent import StrandsDeciderStewardsAgent

logger = logging.getLogger("apexguard.gatekeeper")


class GatekeeperService:
    def __init__(self, agent: Optional[StrandsDeciderStewardsAgent] = None):
        self.agent = agent or StrandsDeciderStewardsAgent()

    async def triage_incident(self, state: IncidentStateVector) -> TriageResult:
        """
        Triages an IncidentStateVector using the reusable Strands Decider 2B agent.
        """
        ruling = self.agent.triage(state)
        return TriageResult(
            incident_id=state.incident_id,
            decision="INFRINGEMENT" if ruling.is_infringement else "RACING_INCIDENT",
            fault_attribution=ruling.fault_attribution,
            fault_driver=ruling.fault_driver,
            breach_category=ruling.breach_category if ruling.is_infringement else "NONE",
            rulebook_article=ruling.rulebook_article,
            penalty_recommendation=ruling.penalty_recommendation,
            confidence=ruling.confidence,
            justification=ruling.justification,
            provider=ruling.provider,
        )
