"""Ollama local LLM provider.

Talks to a locally running Ollama instance (http://localhost:11434 by default)
using raw httpx — no Ollama SDK, no extra dependency. The /api/chat endpoint
is used for both completion and streaming; /api/tags checks model availability.

Default model: phi3.5 (good balance of speed and quality on a laptop CPU/GPU).
Change via the OLLAMA_MODEL env var.

Streaming: the Ollama /api/chat endpoint sends newline-delimited JSON objects.
Each object carries { "message": { "content": "..." }, "done": bool }.
We yield the content chunks directly so the FastAPI StreamingResponse can
forward them to the browser as SSE.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

import httpx

from app.ai.providers.base import LLMProvider

logger = logging.getLogger("uvicorn.error")


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "phi3.5") -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        # Single async client, reused across requests. connect_timeout is short
        # because a missing Ollama should surface quickly, not after 30s.
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0),
        )

    def _messages(self, system: str, user: str) -> list[dict[str, str]]:
        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    async def complete(self, system: str, user: str) -> str:
        """Non-streaming chat completion. Returns the full assistant message."""
        try:
            resp = await self._client.post(
                "/api/chat",
                json={
                    "model": self.model,
                    "messages": self._messages(system, user),
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data.get("message", {}).get("content", "")
            return str(content) if content else ""
        except httpx.ConnectError as err:
            raise RuntimeError(
                f"Cannot reach Ollama at {self.base_url}. "
                "Run: ollama serve  (and make sure phi3.5 is pulled)"
            ) from err
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Ollama error {e.response.status_code}: {e.response.text}") from e

    async def stream(self, system: str, user: str) -> AsyncIterator[str]:
        """Stream content chunks from Ollama chat API."""
        try:
            async with self._client.stream(
                "POST",
                "/api/chat",
                json={
                    "model": self.model,
                    "messages": self._messages(system, user),
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    chunk = obj.get("message", {}).get("content", "")
                    if chunk:
                        yield chunk
                    if obj.get("done"):
                        break
        except httpx.ConnectError:
            yield "\n\n[Error: Cannot reach Ollama. Make sure `ollama serve` is running.]\n"

    async def health(self) -> bool:
        """Check that Ollama is running and the model is available."""
        try:
            resp = await self._client.get("/api/tags", timeout=3.0)
            resp.raise_for_status()
            models = [m.get("name", "") for m in resp.json().get("models", [])]
            # Accept phi3.5, phi3.5:latest, phi3.5:mini, etc.
            available = any(m.startswith(self.model.split(":")[0]) for m in models)
            if not available:
                logger.warning(
                    "Ollama: model '%s' not found. Run: ollama pull %s", self.model, self.model
                )
            return available
        except Exception:
            return False
