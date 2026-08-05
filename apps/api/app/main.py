"""FastAPI app: wires the feature routers, initializes the schema on startup,
and (once the Turso env vars are set) opens the libSQL embedded replica."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.ai.router import router as ai_router
from app.blocked.router import router as blocked_router
from app.core.config import get_settings
from app.core.db import Database, connect, init_schema
from app.core.deps import require_api_key
from app.core.errors import NotFoundError, ValidationError
from app.core.sync import PushScheduler
from app.core.version import PRODUCT_VERSION
from app.documents.router import router as documents_router
from app.events.router import router as events_router
from app.jobs.router import router as jobs_router
from app.listings.router import router as listings_router
from app.meta.router import router as meta_router
from app.search_log.router import router as search_log_router
from app.stats.router import router as stats_router
from app.ws.router import router as ws_router

# uvicorn's logger is the one with a console handler attached, so app lines — errors,
# the per-write commit log — render alongside access logs.
logger = logging.getLogger("uvicorn.error")


def _timestamp_uvicorn_logs() -> None:
    """Prepend a timestamp to uvicorn's log lines. Its default formatter omits the
    clock, making it impossible to correlate an access line, its in-request commit
    log, and a later background-push warning. Runs in lifespan, once uvicorn has
    installed its handlers, re-wrapping each formatter in the same class with an
    `asctime` prefix. Reuses the existing format string rather than hardcoding
    uvicorn's, so it survives version bumps."""
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        for handler in logging.getLogger(name).handlers:
            fmt = handler.formatter
            if fmt is None:
                continue
            base = getattr(fmt, "_fmt", None)
            if not base or "asctime" in base:
                continue
            try:
                handler.setFormatter(type(fmt)(f"%(asctime)s {base}", datefmt="%Y-%m-%d %H:%M:%S"))
            except Exception:  # never let log cosmetics break startup
                logger.debug("could not add timestamp to %s handler", name, exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _timestamp_uvicorn_logs()
    settings = get_settings()
    conn = connect(settings)  # pyturso mode already pulled the latest remote state
    init_schema(conn)
    db = Database(conn)
    app.state.db = db

    # In local-first mode, a debounced background push keeps local writes off the
    # request path, and a periodic pull surfaces another laptop's writes without a
    # restart.
    scheduler = (
        PushScheduler(
            db, settings.turso_push_debounce_seconds, settings.turso_pull_interval_seconds
        )
        if db.syncable
        else None
    )
    app.state.push_scheduler = scheduler
    if scheduler is not None:
        scheduler.start()

    yield

    if scheduler is not None:
        scheduler.stop()  # flushes any pending writes with a final push
    conn.close()


app = FastAPI(title="Job Tracker API", version=PRODUCT_VERSION, lifespan=lifespan)

settings = get_settings()

# Browser-facing allowlist: only the Vite dev server and the extension's fixed
# chrome-extension:// origin ever legitimately call this API from a browser. Prod
# serves the SPA same-origin, which CORS doesn't gate at all.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_dev_origin, f"chrome-extension://{settings.extension_id}"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# DNS-rebinding guard: reject requests whose Host header isn't one of these. Added
# last so it wraps outermost and runs before CORS gets a look. On a local-only personal
# tool this, the CORS allowlist above, and the optional X-API-Key gate below are
# proportionate hardening, not a substitute for real auth on a service that left
# localhost.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)


# 404 is routine here — the deep-link `/listings/lookup` misses by design — so logging
# it would be noise. 400 and 500 are logged with request context.
@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": exc.message})


@app.exception_handler(ValidationError)
async def validation_handler(request: Request, exc: ValidationError) -> JSONResponse:
    # A client error worth seeing: a refused funnel move, a non-note event delete.
    # WARNING carries the reason and the request, but no stack trace — it isn't a bug.
    logger.warning("400 %s %s — %s", request.method, request.url.path, exc.message)
    return JSONResponse(status_code=400, content={"detail": exc.message})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    # Anything uncaught is a bug. Log the full traceback *with* the request that
    # triggered it, since uvicorn alone logs the trace but not the path, and return a
    # consistent JSON body instead of Starlette's plain-text default.
    logger.error("500 %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


# Every feature router mounts under /api, the SPA taking / (see the StaticFiles mount
# below). One parent router declares the optional X-API-Key gate once rather than per
# router. /docs and /openapi.json are FastAPI's own routes, outside this router, so
# they stay unprefixed and ungated.
api_router = APIRouter(dependencies=[Depends(require_api_key)])
for _router in (
    jobs_router,
    listings_router,
    events_router,
    documents_router,
    stats_router,
    search_log_router,
    meta_router,
    blocked_router,
    ai_router,
):
    api_router.include_router(_router)
app.include_router(api_router, prefix="/api")

# WebSocket endpoint mounts outside /api so it isn't gated by the X-API-Key
# middleware — browsers can't set custom headers on WebSocket connections.
app.include_router(ws_router)

# Serve the built dashboard SPA at the root, *after* the API routers so their paths
# win. Mounted only when `apps/web/dist` exists, so `uv run` works whether or not the
# frontend has been built; frontend dev uses Vite's own server, which proxies the API
# back here. `html=True` makes it a real SPA host, falling unknown paths back to
# index.html for client routing.
if settings.web_dist_path.is_dir():
    app.mount("/", StaticFiles(directory=settings.web_dist_path, html=True), name="dashboard")
