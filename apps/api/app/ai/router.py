"""AI feature router.

Endpoints:
  GET  /ai/status                   — health check (is Ollama running + model available?)
  GET  /ai/jobs/{job_id}/fit-score  — fit score for this job vs. the user profile
  GET  /ai/jobs/{job_id}/signal     — should-I-apply signal
  POST /ai/jobs/{job_id}/cover-letter — streaming cover letter (SSE)
  GET  /profile                     — read user profile
  PUT  /profile                     — save user profile

All AI endpoints require a job description in the listing's meta; a missing JD
returns a graceful zero/placeholder rather than a 400.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import cast

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.ai.providers.ollama import OllamaProvider
from app.ai.schemas import (
    AIStatusResponse,
    ApplySignalResponse,
    CoverLetterRequest,
    FitScoreResponse,
    UserProfile,
)
from app.ai.service import AIService
from app.core.config import get_settings
from app.core.db import Database
from app.core.user_profile import load_profile, save_profile
from app.listings.repository import ListingRepository

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/ai", tags=["ai"])


def _get_provider(request: Request) -> OllamaProvider:
    """Build (or reuse a cached) Ollama provider from app settings."""
    cached = getattr(request.app.state, "_ai_provider", None)
    if cached is None:
        s = get_settings()
        cached = OllamaProvider(base_url=s.ollama_base_url, model=s.ollama_model)
        request.app.state._ai_provider = cached
    return cast(OllamaProvider, cached)


def _get_service(request: Request) -> AIService:
    return AIService(_get_provider(request))


def _get_jd(job_id: str, request: Request) -> str:
    """Fetch the best available job description for a job from its listings."""
    db: Database = request.app.state.db
    repo = ListingRepository(db.conn)
    descriptions = repo.descriptions_for_jobs([job_id])
    return descriptions.get(job_id) or ""


# ── Status ────────────────────────────────────────────────────────────────────


@router.get("/status", response_model=AIStatusResponse)
async def ai_status(request: Request) -> AIStatusResponse:
    """Check whether the AI backend is reachable and the model is loaded."""
    provider = _get_provider(request)
    ok = await provider.health()
    s = get_settings()
    return AIStatusResponse(
        provider="ollama",
        model=s.ollama_model,
        available=ok,
        message="Ready"
        if ok
        else f"Ollama not reachable or model '{s.ollama_model}' not pulled. Run: ollama pull {s.ollama_model}",
    )


# ── Profile ───────────────────────────────────────────────────────────────────


@router.get("/profile", response_model=UserProfile)
def get_profile() -> UserProfile:
    """Read the saved candidate profile."""
    return load_profile()


@router.put("/profile", response_model=UserProfile)
def update_profile(profile: UserProfile) -> UserProfile:
    """Save (overwrite) the candidate profile."""
    save_profile(profile)
    return profile


# ── Fit score ─────────────────────────────────────────────────────────────────


@router.get("/jobs/{job_id}/fit-score", response_model=FitScoreResponse)
async def fit_score(job_id: str, request: Request) -> FitScoreResponse:
    """Score how well the candidate profile matches this job's description."""
    jd = _get_jd(job_id, request)
    profile = load_profile()
    service = _get_service(request)
    return await service.fit_score(jd, profile)


# ── Apply signal ──────────────────────────────────────────────────────────────


@router.get("/jobs/{job_id}/signal", response_model=ApplySignalResponse)
async def apply_signal(job_id: str, request: Request) -> ApplySignalResponse:
    """Return a concise apply/consider/skip recommendation."""
    jd = _get_jd(job_id, request)
    profile = load_profile()
    service = _get_service(request)
    return await service.apply_signal(jd, profile)


# ── Cover letter (streaming) ──────────────────────────────────────────────────


@router.post("/jobs/{job_id}/cover-letter")
async def cover_letter(
    job_id: str, body: CoverLetterRequest, request: Request
) -> StreamingResponse:
    """Stream a tailored cover letter as Server-Sent Events.

    Each SSE event: `data: <chunk>\\n\\n`
    Final event:    `data: [DONE]\\n\\n`
    """
    jd = _get_jd(job_id, request)
    if not jd:
        raise HTTPException(
            status_code=422,
            detail="No job description found for this job. Capture the listing first.",
        )
    profile = load_profile()
    service = _get_service(request)

    async def event_stream() -> AsyncIterator[str]:
        async for chunk in service.cover_letter_stream(jd, profile, body.tone, body.max_words):
            # Escape newlines inside a chunk so SSE frame stays intact
            safe = chunk.replace("\n", "\\n")
            yield f"data: {safe}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering if behind a proxy
        },
    )
