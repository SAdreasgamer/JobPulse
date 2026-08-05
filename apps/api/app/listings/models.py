from typing import Any

from pydantic import BaseModel, Field


class Listing(BaseModel):
    id: str
    job_id: str
    platform: str
    platform_id: str
    url: str | None = None
    title: str | None = None
    company: str | None = None
    apply_type: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    captured_at: str | None = None
    closed_at: str | None = None
    updated_at: str | None = None
