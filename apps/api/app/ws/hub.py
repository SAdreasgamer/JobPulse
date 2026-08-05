"""WebSocket hub: broadcast job state changes to all connected dashboard clients.

The hub is a lightweight in-memory set of active WebSocket connections. The
events router calls `broadcast()` after any successful state write so the
dashboard Kanban board updates in real time without polling.

Thread-safety note: FastAPI with uvicorn runs in a single async event loop.
All WebSocket callbacks and the broadcast call happen in the same loop, so a
plain `set` is safe — no asyncio.Lock needed.
"""

import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("uvicorn.error")


class ConnectionHub:
    """Manages active WebSocket connections and fans out state-change events."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    def connect(self, ws: WebSocket) -> None:
        self._connections.add(ws)
        logger.debug("ws connect — %d active", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.debug("ws disconnect — %d active", len(self._connections))

    async def broadcast(self, payload: dict[str, Any]) -> None:
        """Fan a JSON payload to every connected client. Dead connections are
        removed silently — a dashboard tab that was closed stops receiving."""
        if not self._connections:
            return
        message = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.discard(ws)

    async def broadcast_job_updated(self, job_id: str, job_status: str) -> None:
        """Convenience wrapper: notify the dashboard that a specific job changed."""
        await self.broadcast({"type": "jobUpdated", "job_id": job_id, "status": job_status})

    async def broadcast_refresh(self) -> None:
        """Tell all clients to refetch the full job list (e.g. after a bulk op)."""
        await self.broadcast({"type": "refresh"})


# Process-singleton hub — imported by the router and the events service.
hub = ConnectionHub()
