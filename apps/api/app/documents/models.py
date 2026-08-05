from pydantic import BaseModel


class Document(BaseModel):
    id: int
    job_id: str
    type: str
    requested: str | None = None
    provided: bool
    content: str | None = None
    created_at: str
    updated_at: str
