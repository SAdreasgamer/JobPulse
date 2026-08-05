"""AI service — orchestrates prompts and parses LLM responses.

All public methods are async because they call the async LLM provider.
The service is stateless except for the injected provider; it can be
instantiated per-request or shared as a singleton (the provider's httpx
client is already reused across calls).
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any, cast

from app.ai.providers.base import LLMProvider
from app.ai.schemas import ApplySignalResponse, FitScoreResponse, UserProfile

logger = logging.getLogger("uvicorn.error")

# ── Prompt templates ─────────────────────────────────────────────────────────

_FIT_SYSTEM = """You are a career advisor. Given a job description and a candidate profile,
analyze the fit and return ONLY a valid JSON object with this exact schema:
{
  "score": <int 0-100>,
  "matched_skills": [<string>, ...],
  "missing_skills": [<string>, ...],
  "rationale": "<2 sentence explanation>",
  "confidence": "<low|medium|high>"
}
No markdown, no code fences, no extra text — only the JSON object."""

_SIGNAL_SYSTEM = """You are a career advisor. Given a job description and a candidate profile,
return ONLY a valid JSON object with this exact schema:
{
  "recommendation": "<apply|consider|skip>",
  "green_flags": [<string>, ...],
  "red_flags": [<string>, ...],
  "summary": "<one sentence>"
}
No markdown, no code fences, no extra text — only the JSON object."""

_COVER_LETTER_SYSTEM = """You are a professional cover letter writer.
Write a compelling, tailored cover letter based on the job description and candidate profile.
- Start directly with the salutation (Dear Hiring Team,)
- Keep it {max_words} words or fewer
- Tone: {tone}
- Do NOT use placeholder text like [Company Name] — infer what you can from the JD
- Output only the cover letter text, no extra commentary"""


def _profile_summary(profile: UserProfile) -> str:
    parts: list[str] = []
    if profile.name:
        parts.append(f"Name: {profile.name}")
    if profile.title:
        parts.append(f"Current title: {profile.title}")
    if profile.years_experience:
        parts.append(f"Years of experience: {profile.years_experience}")
    if profile.skills:
        parts.append(f"Skills: {', '.join(profile.skills)}")
    if profile.summary:
        parts.append(f"Summary: {profile.summary}")
    if profile.target_roles:
        parts.append(f"Target roles: {', '.join(profile.target_roles)}")
    return "\n".join(parts) if parts else "No profile provided."


def _extract_json(text: str) -> dict[str, Any]:
    """Strip any markdown code fences and parse JSON robustly."""
    # Remove ```json ... ``` or ``` ... ``` wrappers
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
    # Find the first { ... } block in case the model added preamble
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        text = m.group(0)
    data = json.loads(text)
    return cast(dict[str, Any], data) if isinstance(data, dict) else {}


class AIService:
    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider

    async def fit_score(self, job_description: str, profile: UserProfile) -> FitScoreResponse:
        """Score how well the candidate matches the job description."""
        if not job_description.strip():
            return FitScoreResponse(
                score=0,
                rationale="No job description available to score against.",
                confidence="low",
            )
        user_msg = (
            f"## Job Description\n{job_description[:4000]}\n\n"
            f"## Candidate Profile\n{_profile_summary(profile)}"
        )
        raw = await self.provider.complete(_FIT_SYSTEM, user_msg)
        try:
            data = _extract_json(raw)
            return FitScoreResponse.model_validate(data)
        except Exception as exc:
            logger.warning("fit_score JSON parse failed: %s\nRaw: %.200s", exc, raw)
            return FitScoreResponse(
                score=0,
                rationale=f"Could not parse AI response. Raw: {raw[:200]}",
                confidence="low",
            )

    async def apply_signal(self, job_description: str, profile: UserProfile) -> ApplySignalResponse:
        """Return a concise apply/consider/skip recommendation."""
        if not job_description.strip():
            return ApplySignalResponse(
                recommendation="consider", summary="No job description available for analysis."
            )
        user_msg = (
            f"## Job Description\n{job_description[:4000]}\n\n"
            f"## Candidate Profile\n{_profile_summary(profile)}"
        )
        raw = await self.provider.complete(_SIGNAL_SYSTEM, user_msg)
        try:
            data = _extract_json(raw)
            return ApplySignalResponse.model_validate(data)
        except Exception as exc:
            logger.warning("apply_signal JSON parse failed: %s\nRaw: %.200s", exc, raw)
            return ApplySignalResponse(
                recommendation="consider", summary=f"Could not parse AI response: {raw[:200]}"
            )

    async def cover_letter_stream(
        self,
        job_description: str,
        profile: UserProfile,
        tone: str = "professional",
        max_words: int = 300,
    ) -> AsyncIterator[str]:
        """Stream a tailored cover letter chunk by chunk."""
        system = _COVER_LETTER_SYSTEM.format(tone=tone, max_words=max_words)
        user_msg = (
            f"## Job Description\n{job_description[:4000]}\n\n"
            f"## Candidate Profile\n{_profile_summary(profile)}"
        )
        async for chunk in self.provider.stream(system, user_msg):
            yield chunk
