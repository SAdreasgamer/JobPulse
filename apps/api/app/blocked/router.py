from fastapi import APIRouter, Depends, Query, Response

from app.blocked.models import BlockedCompany
from app.blocked.schemas import ALL_PLATFORMS, BlockedCompanyCreate
from app.blocked.service import BlockedCompanyService
from app.core.deps import service_factory

router = APIRouter(tags=["blocked-companies"])

get_service = service_factory(BlockedCompanyService)


@router.get("/blocked-companies", response_model=list[BlockedCompany])
def list_blocked(service: BlockedCompanyService = Depends(get_service)) -> list[BlockedCompany]:
    """List blocked companies."""
    return service.list_all()


@router.post("/blocked-companies", response_model=BlockedCompany, status_code=201)
def block_company(
    body: BlockedCompanyCreate, service: BlockedCompanyService = Depends(get_service)
) -> BlockedCompany:
    """Create or refresh a normalized company block."""
    return service.block(body)


@router.delete("/blocked-companies/{company_key}", status_code=204)
def unblock_company(
    company_key: str,
    platform: str = Query(ALL_PLATFORMS),
    service: BlockedCompanyService = Depends(get_service),
) -> Response:
    """Remove one company block in the requested platform scope."""
    service.unblock(company_key, platform)
    return Response(status_code=204)
