from fastapi import APIRouter, Depends

from app.core.deps import service_factory
from app.meta.schemas import MetaVocabulary
from app.meta.service import MetaService

router = APIRouter(tags=["meta"])

get_service = service_factory(MetaService)


@router.get("/health")
def health() -> dict[str, bool]:
    """DB-free liveness probe for the extension's reachability poll."""
    return {"ok": True}


@router.get("/meta/vocabulary", response_model=MetaVocabulary)
def get_vocabulary(
    entity: str = "jobs", service: MetaService = Depends(get_service)
) -> MetaVocabulary:
    """Return previously used metadata keys and values, most-used first."""
    return service.vocabulary(entity)


@router.get("/meta/note-titles", response_model=list[str])
def get_note_titles(service: MetaService = Depends(get_service)) -> list[str]:
    """Return previously used note titles, most-used first."""
    return service.note_titles()
