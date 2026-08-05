from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import service_factory
from app.search_log.models import SearchLogRow
from app.search_log.schemas import SearchLogCreate, SearchReport
from app.search_log.service import SearchLogService

router = APIRouter(tags=["search-log"])

get_service = service_factory(SearchLogService)


@router.post("/search-log", status_code=204)
def create_search_log(
    body: SearchLogCreate, service: SearchLogService = Depends(get_service)
) -> Response:
    """Record one opted-in popup search session."""
    service.record(body)
    return Response(status_code=204)


@router.delete("/search-log", status_code=204)
def clear_search_log(service: SearchLogService = Depends(get_service)) -> Response:
    """Delete every stored search-diagnostic row."""
    service.clear()
    return Response(status_code=204)


@router.get("/search-log/report", response_model=SearchReport)
def search_log_report(service: SearchLogService = Depends(get_service)) -> SearchReport:
    """Click-through by automatic seed rule, or `typed` when no seed was used."""
    return service.report()


@router.get("/search-log", response_model=list[SearchLogRow])
def list_search_log(
    limit: int = Query(50, ge=1, le=500), service: SearchLogService = Depends(get_service)
) -> list[SearchLogRow]:
    """Return recent search-diagnostic rows, newest first."""
    return service.recent(limit)
