"""
Layer 2: Policy & Rulebook Gatekeeper Service.
Supports Strands Decider 2B cloud policy engine when credentials are present,
with an offline deterministic rulebook fallback evaluator per Spec §6.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
import httpx

from backend.app.config import settings
from backend.app.layer1_math.schemas import IncidentStateVector
from backend.app.layer2_gatekeeper.schemas import TriageResult

logger = logging.getLogger("apexguard.gatekeeper")

RULEBOOK_PATH = Path(__file__).resolve().parent / "rulebook.json"


def load_rulebook() -> Dict[str, Any]:
    with open(RULEBOOK_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


class GatekeeperService:
    def __init__(self):
        self.rulebook = load_rulebook()

    async def triage_incident(self, state: IncidentStateVector) -> TriageResult:
        """
        Triages an IncidentStateVector against the active rulebook.
        Uses Strands Decider 2B if STRANDS_API_KEY is configured in .env,
        otherwise falls back to the local deterministic rulebook evaluator.
        """
        if settings.has_strands_credentials:
            try:
                return await self._call_strands_decider(state)
            except Exception as e:
                logger.warning(f"Strands Decider call failed ({e}); falling back to local rulebook evaluator.")
                return self._evaluate_locally(state)
        else:
            return self._evaluate_locally(state)

    async def _call_strands_decider(self, state: IncidentStateVector) -> TriageResult:
        """Invokes Strands Decider 2B API."""
        prompt_payload = {
            "model": "strands-decider-2b",
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an expert FIA motorsport regulatory steward and policy arbiter. "
                        "Evaluate the following telemetry incident kinematic state vector against the rulebook articles. "
                        "Respond ONLY in valid JSON matching: "
                        "{\"decision\": \"INFRINGEMENT\"|\"RACING_INCIDENT\", "
                        "\"fault_attribution\": \"COMPETITOR_A\"|\"COMPETITOR_B\"|\"5050\", "
                        "\"breach_category\": \"REAR_END_SHUNT\"|\"APEX_DIVEBOMB\"|\"CROWD_SQUEEZE\"|\"NONE\", "
                        "\"rulebook_article\": string, \"penalty_recommendation\": string, "
                        "\"confidence\": float (0.0-1.0), \"justification\": string}"
                    )
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "incident_state": state.model_dump(),
                        "rulebook": self.rulebook["articles"],
                    })
                }
            ],
            "temperature": 0.1,
            "max_tokens": 500,
        }

        headers = {
            "Authorization": f"Bearer {settings.strands_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                settings.strands_endpoint,
                headers=headers,
                json=prompt_payload
            )
            response.raise_for_status()
            data = response.json()
            
            content_str = data["choices"][0]["message"]["content"]
            parsed = json.loads(content_str)

            fault_driver = None
            if parsed.get("fault_attribution") == "COMPETITOR_A":
                fault_driver = state.attacker_driver if state.attacker_id == "competitor_a" else state.defender_driver
            elif parsed.get("fault_attribution") == "COMPETITOR_B":
                fault_driver = state.attacker_driver if state.attacker_id == "competitor_b" else state.defender_driver

            return TriageResult(
                incident_id=state.incident_id,
                decision=parsed["decision"],
                fault_attribution=parsed["fault_attribution"],
                fault_driver=fault_driver,
                breach_category=parsed.get("breach_category", state.categorization),
                rulebook_article=parsed.get("rulebook_article", "Article 33.3"),
                penalty_recommendation=parsed.get("penalty_recommendation", "10-Second Time Penalty"),
                confidence=float(parsed.get("confidence", 0.95)),
                justification=parsed.get("justification", "Evaluated by Strands Decider 2B."),
                provider="strands_2b"
            )

    def _evaluate_locally(self, state: IncidentStateVector) -> TriageResult:
        """
        Deterministic local rulebook evaluator implementing FIA Sporting Regulations.
        """
        articles = self.rulebook["articles"]
        cat = state.categorization

        # Attacker / Defender attribution
        is_att_a = state.attacker_id == "competitor_a"
        att_label = "COMPETITOR_A" if is_att_a else "COMPETITOR_B"
        def_label = "COMPETITOR_B" if is_att_a else "COMPETITOR_A"

        if cat == "REAR_END_SHUNT":
            art = articles["ART_33_3"]
            fault_attr = att_label
            fault_driver = state.attacker_driver
            decision = "INFRINGEMENT"
            penalty = art["standard_penalty"]
            article_ref = f"{art['regulatory_reference']} - {art['title']}"
            justification = (
                f"Attacking driver {state.attacker_driver} ({state.attacker_id}) failed to manage closing velocity "
                f"({state.closing_velocity_kmh} km/h), reducing along-track clearance to {state.along_track_gap_m}m "
                f"(below the 1.0m threshold) and causing an avoidable rear contact into defending driver {state.defender_driver}."
            )
            confidence = 0.96

        elif cat == "APEX_DIVEBOMB":
            art = articles["ART_DRIVING_STANDARDS_APEX"]
            fault_attr = att_label
            fault_driver = state.attacker_driver
            decision = "INFRINGEMENT"
            penalty = art["standard_penalty"]
            article_ref = f"{art['regulatory_reference']} - {art['title']}"
            justification = (
                f"Car {state.attacker_driver} ({state.attacker_id}) attempted an overtake without establishing "
                f"the required 50% overlap prior to corner apex (achieved {state.overlap_ratio * 100:.1f}%) "
                f"with a high approach velocity delta of +{state.delta_v_kmh:.1f} km/h, resulting in an uncontrolled breach."
            )
            confidence = 0.91

        elif cat == "CROWD_SQUEEZE":
            art = articles["ART_33_4"]
            fault_attr = def_label
            fault_driver = state.defender_driver
            decision = "INFRINGEMENT"
            penalty = art["standard_penalty"]
            article_ref = f"{art['regulatory_reference']} - {art['title']}"
            justification = (
                f"Defending car {state.defender_driver} ({state.defender_id}) failed to leave the mandatory 2.0m racing room "
                f"to alongside competitor {state.attacker_driver} (overlap {state.overlap_ratio * 100:.1f}%), "
                f"squeezing lateral clearance down to {state.lateral_gap_m}m at {state.lateral_convergence_ms} m/s convergence."
            )
            confidence = 0.88

        else:
            art = articles["ART_RACING_INCIDENT"]
            fault_attr = "5050"
            fault_driver = None
            decision = "RACING_INCIDENT"
            penalty = art["standard_penalty"]
            article_ref = f"{art['regulatory_reference']} - {art['title']}"
            justification = (
                f"Physical review indicates genuine contested racing room with {state.overlap_ratio * 100:.1f}% chassis overlap. "
                f"Both drivers maintained car control and neither is predominantly to blame for the contact/approach."
            )
            confidence = 0.85

        return TriageResult(
            incident_id=state.incident_id,
            decision=decision,
            fault_attribution=fault_attr,
            fault_driver=fault_driver,
            breach_category=cat if decision == "INFRINGEMENT" else "NONE",
            rulebook_article=article_ref,
            penalty_recommendation=penalty,
            confidence=confidence,
            justification=justification,
            provider="local_deterministic_fallback"
        )
