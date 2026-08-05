"""Request-scoped dependencies: the DB connection, the service-factory builder,
and the optional API-key gate.

`get_conn` yields the shared connection under the database lock and commits at
the end of a successful request (rolling back on error), so services and
repositories never manage transactions themselves.
"""

import logging
import time
from collections.abc import Callable, Iterator
from typing import Protocol

from fastapi import Depends, Header, HTTPException, Request

from app.core.config import Settings, get_settings
from app.core.db import Conn, Database

# Route through uvicorn's own logger so the line renders in the console; a bare app
# logger emitting at INFO has no handler and is dropped.
logger = logging.getLogger("uvicorn.error")


def get_conn(request: Request) -> Iterator[Conn]:
    db: Database = request.app.state.db
    with db.lock:
        try:
            yield db.conn
            start = time.perf_counter()
            db.conn.commit()
            elapsed_ms = (time.perf_counter() - start) * 1000
            # In embedded-replica mode `commit()` is the write-through round-trip to
            # the primary; in pyturso sync mode it's a local ~ms commit and the network
            # happens later on push. Log it for mutating requests only — a GET's commit
            # is a local no-op, so skipping keeps the read stream quiet — and nudge the
            # background pusher so local-first writes replicate.
            if request.method != "GET":
                logger.info("db commit %.0fms  %s %s", elapsed_ms, request.method, request.url.path)
                scheduler = getattr(request.app.state, "push_scheduler", None)
                if scheduler is not None:
                    scheduler.notify_write()
        except Exception:
            db.conn.rollback()
            raise


class _Service(Protocol):
    def __init__(self, conn: Conn) -> None: ...


def service_factory[S: _Service](service_cls: type[S]) -> Callable[[Conn], S]:
    """Build a router's `get_service` dependency. Every feature module's is
    identical but for which `<Domain>Service(conn)` it constructs, so routers call
    `service_factory(XService)` instead of hand-writing the same one-liner."""

    def get_service(conn: Conn = Depends(get_conn)) -> S:
        return service_cls(conn)

    return get_service


def require_api_key(
    x_api_key: str | None = Header(default=None), settings: Settings = Depends(get_settings)
) -> None:
    """Gate every /api route behind `Settings.api_key` when one is configured, and
    no-op while it's unset, matching a purely-localhost personal tool. `settings`
    comes through `Depends` rather than a bare `get_settings()` call so tests can
    override it via `app.dependency_overrides`, same as `get_conn`."""
    if settings.api_key is None:
        return
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="missing or invalid X-API-Key")
