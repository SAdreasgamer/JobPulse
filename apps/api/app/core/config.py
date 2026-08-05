"""Application settings, loaded from environment / a local .env file.

Locally only `db_path` and `port` matter. Setting the `turso_*` values enables
cross-device sync (see core.db) through one of two backends:

- `turso_local_first = False` (the default once a URL is set): libSQL embedded
  replica — reads local, writes write-through to the primary at a network
  round-trip each, ~hundreds of ms.
- `turso_local_first = True`: pyturso local-first — reads *and* writes are local
  and instant, changes are pushed to the primary on a debounce, and the primary
  is pulled on startup and every `turso_pull_interval_seconds` so another
  laptop's writes appear without a restart. Chosen for the single-user desktop
  case, where the write round-trip is the felt latency.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "local" (default) or "test". `APP_ENV=test` points the whole app at a throwaway
    # Turso database: the remote comes from the `turso_test_*` vars and the local
    # replica files relocate under `.test-db/`, so a test run touches neither prod
    # data nor prod replica files. `_apply_test_env` does the swap and fails loudly
    # if the test URL is unset.
    app_env: str = "local"

    db_path: str = "jobtracker.db"
    port: int = 3456
    # The built dashboard SPA `main.py` mounts at `/`. Computed relative to this file
    # (core/config.py -> repo root -> apps/web/dist) so it survives any cwd;
    # overridable for deployments that build the SPA elsewhere.
    web_dist_path: Path = Path(__file__).resolve().parents[4] / "apps" / "web" / "dist"

    turso_database_url: str | None = None
    turso_auth_token: str | None = None

    # Swapped in for the `turso_*` values above when `app_env == "test"`, so ad-hoc
    # experiments and the `turso`-marked integration tests hit a disposable remote.
    # Separate vars let both credential sets live in one `.env` and flip on a single
    # `APP_ENV` line, never editing — and risking — the real `turso_database_url`.
    turso_test_database_url: str | None = None
    turso_test_auth_token: str | None = None

    # Local-first (pyturso) mode: reads and writes stay local and instant, pushed in
    # the background. False = libSQL embedded replica, where writes write-through.
    turso_local_first: bool = False
    # Seconds of write-quiet before a debounced background push fires.
    turso_push_debounce_seconds: float = 4.0
    # Remote-pull cadence, in seconds. Embedded-replica mode passes it to libSQL's
    # sync_interval; local-first mode drives core.sync's background pull loop with it,
    # so another laptop's writes show up without a restart.
    turso_pull_interval_seconds: int = 60

    # Output root for the standalone maintenance scripts, whose log/report files land
    # under `<this>/log/`. Repo-relative by default so a fresh checkout needs no
    # configuration; override in `.env` to target a specific machine's real directory.
    scripts_output_dir: Path = Path("script-output")

    # Dashboard attention thresholds. A stalled applied/in-process job is projected as
    # needing attention only after this many whole days without a status-setting event
    # or note. Zero disables the projection for that stage.
    attention_applied_days: int = Field(default=21, ge=0)
    attention_in_process_days: int = Field(default=14, ge=0)

    # --- AI / LLM ----------------------------------------------------------

    # Ollama base URL. Override if Ollama runs on a different port or machine.
    ollama_base_url: str = "http://localhost:11434"
    # Ollama model name. phi3.5 is fast on a laptop CPU and free.
    # Change to "llama3.2", "mistral", "gemma2:2b", etc. for alternatives.
    ollama_model: str = "phi3.5"

    # --- security ----------------------------------------------------------

    # CORS allowlist for the API: the only two browser origins ever expected to call
    # it. `web_dev_origin` is Vite's dev server, prod serving the built SPA
    # same-origin. `extension_id` is Chrome's stable id, derived from the extension's
    # pinned manifest key (apps/extension/manifest.config.ts), so its
    # `chrome-extension://<id>` origin is fixed across reloads and installs.
    web_dev_origin: str = "http://localhost:5173"
    extension_id: str = "kepjjdggnlkcnedgabpknmpnknblokil"

    # Host headers TrustedHostMiddleware accepts — a DNS-rebinding guard, so a
    # malicious page can't point a browser's Host header here from an
    # attacker-controlled domain that merely resolves to localhost. "testserver" is
    # FastAPI's TestClient default, needed so the suite isn't itself rejected.
    trusted_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]

    # Optional shared-secret gate (`X-API-Key`) on every /api request. Unset means no
    # auth, matching a purely-localhost personal tool. Neither the dashboard nor the
    # extension sends this header, so enabling it requires a trusted intermediary that
    # injects it, or API scripts that supply it.
    api_key: str | None = None

    @model_validator(mode="after")
    def _apply_test_env(self) -> Settings:
        """Under `app_env == "test"`, redirect both the remote and the local replica
        files to their test counterparts. Both halves matter: swapping only the remote
        URL would bootstrap the test remote on top of prod's local `.sync` replica,
        either erroring with "unexpected metadata file format" or silently mixing test
        and prod data."""
        if self.app_env != "test":
            return self
        if not self.turso_test_database_url:
            raise ValueError(
                "APP_ENV=test requires TURSO_TEST_DATABASE_URL — point it at a "
                "throwaway Turso database, never the real primary."
            )
        self.turso_database_url = self.turso_test_database_url
        self.turso_auth_token = self.turso_test_auth_token
        # Relocate the whole replica family (db, .sync, .sync-wal, …) into a sibling
        # .test-db/ so it never sits next to, or clobbers, prod's files.
        p = Path(self.db_path)
        self.db_path = str(p.parent / ".test-db" / p.name)
        return self


@lru_cache
def get_settings() -> Settings:
    """The process-wide `Settings`, constructed lazily on first use and cached, so
    importing this module never has the side effect of reading the environment or
    `.env`. Tests can `get_settings.cache_clear()` to force a fresh read."""
    return Settings()
