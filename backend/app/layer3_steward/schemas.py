"""
Schemas for Layer 3 Judicial Steward (Amazon Bedrock & Local Template Fallback).
"""

from typing import Optional, List
from pydantic import BaseModel, Field


class StewardsBulletin(BaseModel):
    document_id: str = Field(..., description="Official FIA document reference ID (e.g. DOC-2026-042)")
    timestamp_utc: str = Field(..., description="UTC timestamp of judicial decision publication")
    competition: str = Field("2026 FIA Formula One World Championship", description="Governing championship")
    event: str = Field(..., description="Event name / Grand Prix")
    session_name: str = Field("Race", description="Session classification (Race, Sprint, Qualifying)")
    headline: str = Field(..., description="Official decision banner / header")
    competitor_penalized: Optional[str] = Field(None, description="Driver / Team receiving judicial sanction")
    car_number: Optional[str] = Field(None, description="Competition car number if applicable")
    infringement: str = Field(..., description="Specific regulatory article breached")
    decision: str = Field(..., description="Judicial sanction (e.g. 10-Second Time Penalty, 2 Penalty Points)")
    time_penalty_seconds: Optional[float] = Field(None, description="Numerical time penalty added to elapsed time")
    penalty_points: int = Field(0, description="Super Licence penalty points issued")
    facts: str = Field(..., description="Concise kinematic facts established from synchronized telemetry")
    reasoning: str = Field(..., description="Formal judicial findings, telemetry review, and regulatory rationale")
    signatories: List[str] = Field(default_factory=list, description="Panel of Stewards of the Meeting")
    provider: str = Field(..., description="'amazon_bedrock' or 'local_template_fallback'")
