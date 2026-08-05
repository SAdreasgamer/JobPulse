from app.blocked.models import BlockedCompany
from app.blocked.repository import BlockedCompanyRepository
from app.blocked.schemas import ALL_PLATFORMS, BlockedCompanyCreate
from app.core.db import Conn
from app.core.errors import NotFoundError, ValidationError
from app.core.text import normalize_company
from app.core.timeutil import utc_now


class BlockedCompanyService:
    def __init__(self, conn: Conn) -> None:
        self.repo = BlockedCompanyRepository(conn)

    def list_all(self) -> list[BlockedCompany]:
        return self.repo.list_all()

    def block(self, body: BlockedCompanyCreate) -> BlockedCompany:
        # Normalize to the same key jobs carry, so the block matches every posting
        # from the company. A name that normalizes to nothing (empty/punctuation)
        # can't be keyed, so refuse it rather than store an unmatchable row.
        company_key = normalize_company(body.company)
        if not company_key:
            raise ValidationError("Company name is empty after normalization.")
        label = body.company.strip() or None
        created_at = utc_now()
        self.repo.upsert(
            company_key=company_key, platform=body.platform, label=label, created_at=created_at
        )
        return BlockedCompany(
            company_key=company_key, platform=body.platform, label=label, created_at=created_at
        )

    def unblock(self, company_key: str, platform: str = ALL_PLATFORMS) -> None:
        if not self.repo.delete(company_key, platform):
            raise NotFoundError(f"'{company_key}' is not blocked on '{platform}'.")
