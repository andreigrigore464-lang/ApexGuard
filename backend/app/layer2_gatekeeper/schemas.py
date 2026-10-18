"""
Schemas for Layer 2 Rulebook Gatekeeper (Strands Decider 2B & Local Evaluator).
"""

from typing import Optional
from pydantic import BaseModel, Field


class TriageResult(BaseModel):
    incident_id: str = Field(..., description="Unique incident identifier")
    decision: str = Field(..., description="'INFRINGEMENT' or 'RACING_INCIDENT'")
    fault_attribution: str = Field(..., description="'COMPETITOR_A', 'COMPETITOR_B', or '5050'")
    fault_driver: Optional[str] = Field(None, description="Driver identified as predominantly to blame")
    breach_category: str = Field(..., description="REAR_END_SHUNT, APEX_DIVEBOMB, CROWD_SQUEEZE, or NONE")
    rulebook_article: str = Field(..., description="Cited regulatory article")
    penalty_recommendation: str = Field(..., description="Recommended judicial sporting penalty")
    confidence: float = Field(..., description="Decider confidence score (0.0 to 1.0)")
    justification: str = Field(..., description="Technical and regulatory reasoning")
    provider: str = Field(..., description="'strands_2b' or 'local_deterministic_fallback'")
