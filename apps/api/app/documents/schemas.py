from typing import Literal

from pydantic import BaseModel

from app.core.enums import DocumentType


class DocumentCreate(BaseModel):
    type: DocumentType
    requested: Literal["required", "optional"] | None = None
    provided: bool = False
    content: str | None = None


class DocumentUpdate(BaseModel):
    """Fields to change on an existing document."""

    type: DocumentType | None = None
    requested: Literal["required", "optional"] | None = None
    provided: bool | None = None
    content: str | None = None
