"""Shared enums and status/event rules.

This module is the AUTHORITY for the funnel rules: the active order, the terminal
set, and the forward-only guard `target_status`. Nothing is shared across the two
runtimes, so the same rules are mirrored in the TypeScript package both frontends
use and must be kept in lock-step with it:
  • packages/shared/src/funnel/index.ts
  • packages/shared/src/funnel/funnel.contract.json
"""

from enum import StrEnum


class Status(StrEnum):
    # Active funnel — genuinely sequential.
    NEW = "new"
    SEEN = "seen"
    TO_APPLY = "to_apply"
    APPLIED = "applied"
    IN_PROCESS = "in_process"
    OFFERED = "offered"
    # Terminal outcomes differ by who ended the opportunity.
    SKIPPED = "skipped"
    CLOSED = "closed"
    WITHDRAWN = "withdrawn"
    REJECTED = "rejected"
    # An application that got no employer response at all, distinct from a rejection
    # (they answered) or a closed posting. Terminal, reached from applied.
    GHOSTED = "ghosted"


# Compared by string value so both raw strings and Status members work the same.
_TERMINAL_VALUES: frozenset[str] = frozenset(
    s.value
    for s in (Status.SKIPPED, Status.CLOSED, Status.WITHDRAWN, Status.REJECTED, Status.GHOSTED)
)


def is_terminal(status: str) -> bool:
    return str(status) in _TERMINAL_VALUES


# Position in the active (sequential) funnel. Terminal outcomes are absent: they're
# not stages, so they have no rank.
_ACTIVE_ORDER: dict[str, int] = {
    Status.NEW.value: 0,
    Status.SEEN.value: 1,
    Status.TO_APPLY.value: 2,
    Status.APPLIED.value: 3,
    Status.IN_PROCESS.value: 4,
    Status.OFFERED.value: 5,
}


def active_rank(status: str) -> int | None:
    """Rank within the active funnel, or None for terminal/unknown statuses."""
    return _ACTIVE_ORDER.get(str(status))


# Statuses implying an application was actually submitted: the post-apply active
# stages plus the terminals that only exist once one does — a rejection answers an
# application, a withdrawal retracts one. `skipped`/`closed` end a job *without* an
# application, so they carry no evidence. Advisory, like the normalized keys: it drives
# the "previous applications to this company" count, never a state transition.
APPLIED_EVIDENCE: frozenset[str] = frozenset(
    s.value
    for s in (
        Status.APPLIED,
        Status.IN_PROCESS,
        Status.OFFERED,
        Status.WITHDRAWN,
        Status.REJECTED,
        Status.GHOSTED,
    )
)


# How much funnel history a status represents, for picking which of two jobs survives
# a repost merge. The load-bearing boundary: every applied-or-beyond outcome —
# including the terminals that FOLLOW an application — outranks anything
# pre-application, so merging a fresh repost into a job you already applied to never
# discards the application record. Pre-application signals rank among themselves only
# to make ties deterministic. Shared by listings/service.py's live merge and
# scripts/merge_duplicates.py's bulk offline one, so the two can't disagree.
MERGE_IMPORTANCE: dict[str, int] = {
    Status.NEW.value: 0,
    Status.SEEN.value: 1,
    Status.SKIPPED.value: 2,
    Status.CLOSED.value: 3,
    Status.TO_APPLY.value: 4,
    Status.APPLIED.value: 5,
    Status.REJECTED.value: 5,
    Status.WITHDRAWN.value: 5,
    Status.IN_PROCESS.value: 6,
    Status.OFFERED.value: 7,
}


class Event(StrEnum):
    # Server-generated at job birth (never client-submitted); meta records `via`.
    CREATED = "created"
    # Funnel-status events — each sets the matching status. `seen` is the (once,
    # monotonic) funnel entry; `new` has no event.
    SEEN = "seen"
    TO_APPLY = "to_apply"
    APPLIED = "applied"
    IN_PROCESS = "in_process"
    OFFERED = "offered"
    SKIPPED = "skipped"
    WITHDRAWN = "withdrawn"
    REJECTED = "rejected"
    CLOSED = "closed"
    GHOSTED = "ghosted"
    # Flag events — toggle a boolean; logged only when they carry novel meta.
    HIDDEN = "hidden"
    UNHIDDEN = "unhidden"
    STARRED = "starred"
    UNSTARRED = "unstarred"
    # A manual log entry: dated activity (a call, a follow-up) that moves no funnel
    # state. Setting no status and no flag puts it outside the lifecycle, so undo and
    # correct never touch it. Always logged, freely editable and deletable.
    NOTE = "note"


# A flag event sets (column, value) — NOT an identity map, so it's spelled out.
_EVENT_FLAG: dict[Event, tuple[str, bool]] = {
    Event.HIDDEN: ("hidden", True),
    Event.UNHIDDEN: ("hidden", False),
    Event.STARRED: ("starred", True),
    Event.UNSTARRED: ("starred", False),
}


def status_for_event(event: str) -> Status | None:
    """A funnel event shares its name with the status it sets, so the mapping is
    identity: `seen`→`seen`. Flag and `created` events aren't statuses, so
    `Status(...)` raises and they resolve to None. `new` is the one status with no
    event — a job is born there via `created`, never transitions to it.
    """
    try:
        return Status(event)
    except ValueError:
        return None


def flag_for_event(event: str) -> tuple[str, bool] | None:
    try:
        return _EVENT_FLAG.get(Event(event))
    except ValueError:
        return None


# A deliberate dashboard correction is logged as `corrected:<status>`. The prefix
# keeps corrections a distinct, cheaply-filtered namespace in the indexed `event`
# column, so analytics can exclude them, while the target status reuses the funnel
# identity map. Only the *to* is encoded: the *from* is the job's current status,
# always recoverable from the log, so it isn't denormalized here.
CORRECTION_PREFIX = "corrected:"


def correction_event(status: Status) -> str:
    """The event value logged for a correction that sets `status`."""
    return f"{CORRECTION_PREFIX}{status.value}"


def parse_correction(event: str) -> Status | None:
    """The status a `corrected:<status>` event sets, or None when `event` isn't a
    correction verb or names an unknown status. Any real status is a valid target:
    a correction is the explicit exception path, so `new` and the terminals are
    reachable here even though the organic funnel never transitions to them."""
    if not event.startswith(CORRECTION_PREFIX):
        return None
    return status_for_event(event[len(CORRECTION_PREFIX) :])


def status_set_by(event: str) -> str | None:
    """The status this event set, if it's a status-setting one — an organic funnel
    transition *or* a correction. Flags and `created` set none and resolve to None.
    State-undo replays over this projection, which treats corrections and organic
    transitions uniformly, latest one winning."""
    organic = status_for_event(event)
    if organic is not None:
        return organic.value
    corrected = parse_correction(event)
    return corrected.value if corrected is not None else None


def target_status(event: str, current: str) -> str | None:
    """The status this funnel event should set, or None if it must not change it.
    Funnel events only move forward, for every submission alike. A downgrade —
    reviving a terminal, or stepping the active funnel back — is never a plain
    event; the only paths down are a correction or a revert.

    Both the write path (events/service.py, deciding whether to log at all) and the
    merge cascade (listings/service.py, deciding whether a merged log's winning
    event may stand) run organic events through this. The projection itself stays
    pure latest-ts-wins and never consults the guard.
    """
    target = status_for_event(event)
    assert target is not None
    if target == Status.GHOSTED and current not in {Status.APPLIED.value, Status.IN_PROCESS.value}:
        # Ghosting describes a stalled application/process, not a generic close
        # outcome. Historical exceptions remain available through corrections.
        return None
    if target == Status.SEEN:
        return Status.SEEN.value if current == Status.NEW.value else None  # monotonic
    if is_terminal(current):
        # A terminal outcome is an end state. No plain event moves it, neither
        # reviving it to an active stage nor reclassifying it to another terminal
        # (rejected→skipped); both are deliberate overrides, leaving only a
        # correction or a revert. Re-firing the same terminal is a no-op the caller
        # handles.
        return None if target.value != current else target.value
    # ...nor walk the active funnel backward: a re-detected `applied` on a job already
    # `in_process`, or a dashboard misclick, must not downgrade it.
    cur_rank, tgt_rank = active_rank(current), active_rank(target.value)
    if cur_rank is not None and tgt_rank is not None and tgt_rank < cur_rank:
        return None
    return target.value


class ApplyType(StrEnum):
    EASY_APPLY = "easy_apply"
    EXTERNAL = "external"
    UNKNOWN = "unknown"


class DocumentType(StrEnum):
    # Deliverables tied to an application, each carrying `requested`/`provided`.
    # Free-form notes are not here: a dated note is a `note` event on the timeline,
    # a standing fact is a job annotation.
    COVER_LETTER = "cover_letter"
    MOTIVATION_LETTER = "motivation_letter"
    CV = "cv"
    OTHER = "other"
