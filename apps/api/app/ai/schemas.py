"""Pydantic schemas for the AI feature endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class FitScoreResponse(BaseModel):
    """Structured fit analysis for a job."""

    score: int = Field(ge=0, le=100, description="Overall fit score (0–100)")
    matched_skills: list[str] = Field(default_factory=list, description="Skills from JD you have")
    missing_skills: list[str] = Field(default_factory=list, description="Skills from JD you lack")
    rationale: str = Field(description="2-sentence explanation of the score")
    confidence: str = Field(
        default="medium", description="low / medium / high based on JD completeness"
    )


class ApplySignalResponse(BaseModel):
    """Concise 'should I apply?' signal."""

    recommendation: str = Field(description="apply / consider / skip")
    green_flags: list[str] = Field(
        default_factory=list, description="Positive signals for this role"
    )
    red_flags: list[str] = Field(default_factory=list, description="Concerns or mismatches")
    summary: str = Field(description="One sentence summary")


class CoverLetterRequest(BaseModel):
    """Optional overrides when requesting a cover letter."""

    tone: str = Field(
        default="professional", description="professional / conversational / enthusiastic"
    )
    max_words: int = Field(default=300, ge=100, le=600)


class UserProfile(BaseModel):
    """The candidate's profile used for all AI features."""

    name: str = Field(default="")
    title: str = Field(default="", description="Current/target role title")
    skills: list[str] = Field(default_factory=list)
    years_experience: int = Field(default=0, ge=0)
    summary: str = Field(default="", description="2-3 sentence professional summary")
    target_roles: list[str] = Field(default_factory=list)


class AIStatusResponse(BaseModel):
    """Health check for the AI subsystem."""

    provider: str
    model: str
    available: bool
    message: str
