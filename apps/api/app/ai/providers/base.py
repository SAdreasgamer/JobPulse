"""Abstract LLM provider interface.

All providers expose three methods:
  - complete()  → one-shot text completion (JSON mode)
  - stream()    → async generator of text chunks (for SSE cover-letter endpoint)
  - health()    → True if the backend is reachable

Adding a new provider means subclassing LLMProvider and registering it in
app/core/config.py's `ai_provider` field.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class LLMProvider(ABC):
    """Common interface for all LLM backends."""

    @abstractmethod
    async def complete(self, system: str, user: str) -> str:
        """Return a full completion string (no streaming).
        Callers expect JSON-parseable output when `json_mode=True` is the
        intent — providers should apply best-effort JSON-only prompting."""

    @abstractmethod
    def stream(self, system: str, user: str) -> AsyncIterator[str]:
        """Yield text chunks as they arrive from the model."""

    @abstractmethod
    async def health(self) -> bool:
        """Return True if the provider is reachable and the model is available."""
