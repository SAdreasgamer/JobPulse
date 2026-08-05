from app.core.db import Conn
from app.stats.repository import StatsRepository
from app.stats.schemas import Stats


class StatsService:
    def __init__(self, conn: Conn) -> None:
        self.repo = StatsRepository(conn)

    def compute(self) -> Stats:
        funnel = {row["status"]: row["n"] for row in self.repo.funnel_counts()}
        apply_type = {
            (row["apply_type"] or "unknown"): row["n"] for row in self.repo.apply_type_counts()
        }
        return Stats(total_jobs=self.repo.total_jobs(), funnel=funnel, apply_type=apply_type)
