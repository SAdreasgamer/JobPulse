"""WebSocket router: exposes /ws/jobs for dashboard real-time updates.

Clients connect with:
    const ws = new WebSocket("ws://localhost:3456/ws/jobs");
    ws.onmessage = (e) => { const msg = JSON.parse(e.data); ... };

Message types the server pushes:
    { "type": "jobUpdated", "job_id": "...", "status": "applied" }
    { "type": "refresh" }   — refetch everything (bulk ops)

The WebSocket endpoint sits outside the /api prefix so it isn't gated by the
optional X-API-Key middleware (WebSocket clients can't set custom headers in
the browser WebSocket API).
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.hub import hub

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["ws"])


@router.websocket("/ws/jobs")
async def jobs_ws(ws: WebSocket) -> None:
    """Accept a dashboard connection and keep it alive until the tab closes."""
    await ws.accept()
    hub.connect(ws)
    try:
        # Keep the connection alive by reading (and discarding) any client pings.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws)
