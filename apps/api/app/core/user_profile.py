"""User profile store — persists candidate context for AI features.

Stored as a plain JSON file (`profile.json`) next to the database, not in the
DB. It's personal metadata about the *user*, not about tracked jobs, so it
lives outside the job-data schema and isn't included in DB backups. The file
is created on first write; reads before first write return a blank profile.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.ai.schemas import UserProfile

logger = logging.getLogger("uvicorn.error")

_PROFILE_FILE = Path("profile.json")


def load_profile() -> UserProfile:
    """Read the profile from disk, returning defaults if absent or corrupt."""
    if not _PROFILE_FILE.exists():
        return UserProfile()
    try:
        return UserProfile.model_validate_json(_PROFILE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("profile.json unreadable (%s) — using defaults", exc)
        return UserProfile()


def save_profile(profile: UserProfile) -> None:
    """Write the profile to disk (pretty-printed for human editability)."""
    _PROFILE_FILE.write_text(profile.model_dump_json(indent=2), encoding="utf-8")
    logger.info("profile saved to %s", _PROFILE_FILE.resolve())
