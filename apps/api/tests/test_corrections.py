"""Dashboard corrections and status undo: the two ways state moves
*against* the one-directional funnel. `corrected:<status>` is a deliberate,
audited override that bypasses every guard; `status/revert` erases a misclicked
transition and re-derives from the log. Both are job-addressed (dashboard) only."""

from typing import Any

from fastapi.testclient import TestClient


def _listing(client: TestClient, platform: str, platform_id: str, **extra: Any) -> dict[str, Any]:
    return client.post(
        "/api/listings", json={"platform": platform, "platform_id": platform_id, **extra}
    ).json()


def _emit(client: TestClient, event: str, **addr: Any):
    return client.post("/api/events", json={**addr, "events": [{"event": event}]})


def _events(client: TestClient, job_id: str) -> list[dict[str, Any]]:
    return client.get(f"/api/jobs/{job_id}").json()["events"]


def _kind(client: TestClient, job_id: str, kind: str) -> list[dict[str, Any]]:
    return [e for e in _events(client, job_id) if e["event"] == kind]


def _correct(client: TestClient, job_id: str, status: str, reason: str | None = None):
    body: dict[str, Any] = {"status": status}
    if reason is not None:
        body["reason"] = reason
    return client.post(f"/api/jobs/{job_id}/corrections", json=body)


def _revert(client: TestClient, job_id: str):
    return client.post(f"/api/jobs/{job_id}/status/revert")


# --- corrections: guard bypass + honest logging ------------------------------


def test_correction_revives_a_terminal_outcome(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _emit(client, "rejected", job_id=jid)
    r = _correct(client, jid, "in_process", reason="wrong job")
    assert r.status_code == 200 and r.json()["status"] == "in_process"
    logged = _kind(client, jid, "corrected:in_process")
    assert len(logged) == 1
    assert logged[0]["meta"] == {"reason": "wrong job"}


def test_correction_wins_over_a_backdated_mess(client: TestClient) -> None:
    # After a stale terminal was backdated into the log (logged but not projected,
    # latest-ts-wins), a correction is stamped now → it's the newest-ts status event
    # and cleanly owns the projection.
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _emit(client, "in_process", job_id=jid)
    client.post(
        "/api/events",
        json={"job_id": jid, "ts": "2026-05-21T00:00:00+00:00", "events": [{"event": "rejected"}]},
    )
    assert client.get(f"/api/jobs/{jid}").json()["status"] == "in_process"  # unmoved by stale
    r = _correct(client, jid, "offered", reason="verified offer")
    assert r.json()["status"] == "offered"
    assert client.get(f"/api/jobs/{jid}").json()["status"] == "offered"


def test_correction_can_unsee_back_to_new(client: TestClient) -> None:
    # `seen` is monotonic even for the dashboard; only a correction can undo it.
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _emit(client, "seen", platform="linkedin", platform_id="1")
    r = _correct(client, jid, "new")
    assert r.json()["status"] == "new"
    assert len(_kind(client, jid, "corrected:new")) == 1


def test_correction_to_current_status_is_a_noop(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _emit(client, "applied", job_id=jid)
    r = _correct(client, jid, "applied")
    assert r.json()["status"] == "applied"
    assert _kind(client, jid, "corrected:applied") == []  # nothing to correct → no row


def test_correction_without_reason_logs_bare_row(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _correct(client, jid, "offered")
    logged = _kind(client, jid, "corrected:offered")
    assert len(logged) == 1 and logged[0]["meta"] is None


def test_correction_on_missing_job_is_404(client: TestClient) -> None:
    assert _correct(client, "nope", "applied").status_code == 404


def test_correction_rejects_unknown_status(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")
    assert _correct(client, job["job_id"], "banana").status_code == 422


# --- status/revert: undo a misclicked transition -----------------------------


def test_revert_undoes_last_transition_and_rederives(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _emit(client, "applied", job_id=jid)
    _emit(client, "in_process", job_id=jid)
    r = _revert(client, jid)
    assert r.json()["status"] == "applied"  # fell back to the prior transition
    assert _kind(client, jid, "in_process") == []  # the misclick row is gone
    assert len(_kind(client, jid, "applied")) == 1  # the real one survives


def test_revert_of_seen_returns_to_new(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _emit(client, "seen", platform="linkedin", platform_id="1")
    r = _revert(client, jid)
    assert r.json()["status"] == "new"  # no prior transition → funnel floor
    assert _kind(client, jid, "seen") == []


def test_revert_with_no_transitions_is_a_noop(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")  # born `new`, no funnel events
    jid = job["job_id"]
    r = _revert(client, jid)
    assert r.json()["status"] == "new"
    assert _kind(client, jid, "created")  # birth event untouched


def test_revert_undoes_a_correction_too(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _emit(client, "applied", job_id=jid)
    _correct(client, jid, "rejected")
    r = _revert(client, jid)  # a correction is a status-setting event, so it's undoable
    assert r.json()["status"] == "applied"
    assert _kind(client, jid, "corrected:rejected") == []


def test_revert_ignores_flags(client: TestClient) -> None:
    job = _listing(client, "linkedin", "1", title="A")
    jid = job["job_id"]
    _emit(client, "applied", job_id=jid)
    _emit(client, "starred", job_id=jid)  # a flag, not a transition
    r = _revert(client, jid)
    assert r.json()["status"] == "new"  # reverted the `applied`, not the star
    assert r.json()["starred"] is True  # star is left alone


def test_revert_on_missing_job_is_404(client: TestClient) -> None:
    assert _revert(client, "nope").status_code == 404
