from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.db import Conn, connect, init_schema
from app.core.deps import get_conn
from app.main import app


@pytest.fixture
def conn() -> Iterator[sqlite3.Connection]:
    # In-memory sqlite stands in for libSQL (wire-compatible). check_same_thread
    # is off because FastAPI runs sync endpoints in a worker thread.
    connection = sqlite3.connect(":memory:", check_same_thread=False)
    init_schema(connection)
    yield connection
    connection.close()


@pytest.fixture
def client(conn: sqlite3.Connection) -> Iterator[TestClient]:
    def override() -> Iterator[sqlite3.Connection]:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    app.dependency_overrides[get_conn] = override
    # No `with` block: skip the lifespan so tests never open the real libSQL file.
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def turso_conn(tmp_path: Path) -> Iterator[Conn]:
    """A real libSQL/pyturso connection to the throwaway test DB, for the handful of
    behaviours in-memory sqlite can't stand in for (sync push/pull, embedded-replica
    write-through, driver quirks). Skips unless TURSO_TEST_DATABASE_URL is set, so it
    stays inert without credentials even under `pytest -m turso`.

    It drives the production `connect()` via a real `APP_ENV=test` Settings (the test
    remote is picked up from the env), but relocates the local replica into pytest's
    `tmp_path` so runs never share on-disk state. Mark tests using it `@pytest.mark.turso`."""
    if not os.getenv("TURSO_TEST_DATABASE_URL"):
        pytest.skip("set TURSO_TEST_DATABASE_URL to run turso integration tests")
    settings = Settings(
        app_env="test", db_path=str(tmp_path / "jobtracker.db"), turso_local_first=True
    )
    conn = connect(settings)
    init_schema(conn)
    yield conn
    conn.close()
