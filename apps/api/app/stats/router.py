from fastapi import APIRouter, Depends

from app.core.deps import service_factory
from app.stats.schemas import Stats
from app.stats.service import StatsService

router = APIRouter(tags=["stats"])

get_service = service_factory(StatsService)


@router.get("/stats", response_model=Stats)
def get_stats(service: StatsService = Depends(get_service)) -> Stats:
    return service.compute()
