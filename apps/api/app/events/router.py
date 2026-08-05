import asyncio

from fastapi import APIRouter, Depends, Response

from app.core.deps import service_factory
from app.events.models import Event
from app.events.schemas import CorrectionCreate, EventCreate, EventUpdate
from app.events.service import EventService
from app.jobs.schemas import JobState
from app.ws.hub import hub

router = APIRouter(tags=["events"])

get_service = service_factory(EventService)


def _broadcast(job_id: str, status: str) -> None:
    """Fire-and-forget WebSocket push from a sync route handler.
    asyncio.get_event_loop().create_task() schedules it on the running loop
    without blocking the HTTP response."""
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(hub.broadcast_job_updated(job_id, status))
    except RuntimeError:
        pass  # no loop (e.g. test run without a WS client) — skip silently


@router.post("/events", response_model=JobState)
def create_event(body: EventCreate, service: EventService = Depends(get_service)) -> JobState:
    """Submit a state change (status transition or hide/star flag) addressed by
    `(platform, platform_id)` or `job_id`; returns the resulting job state."""
    state = service.record(body)
    _broadcast(state.job_id if hasattr(state, "job_id") else "", state.status)
    return state


@router.patch("/events/{event_id}", response_model=Event)
def edit_event(
    event_id: int, body: EventUpdate, service: EventService = Depends(get_service)
) -> Event:
    """Update an event's metadata and/or timestamp without changing its verb."""
    return service.edit(event_id, body.meta, set_meta="meta" in body.model_fields_set, ts=body.ts)


@router.delete("/events/{event_id}", status_code=204)
def delete_note_event(event_id: int, service: EventService = Depends(get_service)) -> Response:
    """Delete a note; state-changing events require correction or revert."""
    service.delete_note(event_id)
    return Response(status_code=204)


@router.post("/jobs/{job_id}/corrections", response_model=JobState)
def correct_status(
    job_id: str, body: CorrectionCreate, service: EventService = Depends(get_service)
) -> JobState:
    """Set any status and record the deliberate correction."""
    state = service.correct(job_id, body.status, body.reason)
    _broadcast(job_id, body.status)
    return state


@router.post("/jobs/{job_id}/status/revert", response_model=JobState)
def revert_status(job_id: str, service: EventService = Depends(get_service)) -> JobState:
    """Remove the latest status-setting event and reproject the prior state."""
    state = service.revert_last_status(job_id)
    _broadcast(job_id, state.status)
    return state
