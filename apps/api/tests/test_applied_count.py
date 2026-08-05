"""Company applied-count: GET /jobs/applied-count (the extension's "previous
applications to this company" badge). See JobService.applied_count and
enums.APPLIED_EVIDENCE for which statuses count as an application."""

from typing import Any

from fastapi.testclient import TestClient


def _listing(client: TestClient, platform_id: str, **extra: Any) -> dict[str, Any]:
    resp = client.post(
        "/api/listings", json={"platform": "linkedin", "platform_id": platform_id, **extra}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _emit(client: TestClient, platform_id: str, event: str) -> None:
    resp = client.post(
        "/api/events",
        json={"platform": "linkedin", "platform_id": platform_id, "events": [{"event": event}]},
    )
    assert resp.status_code == 200, resp.text


def _count(client: TestClient, company: str | None) -> dict[str, Any]:
    params = {"company": company} if company is not None else {}
    resp = client.get("/api/jobs/applied-count", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_counts_only_applied_evidence(client: TestClient) -> None:
    # Three jobs at the same company: applied, rejected (post-application
    # terminal), and merely seen. Only the first two are applications.
    _listing(client, "1", title="Backend Engineer", company="Example Company")
    _emit(client, "1", "applied")
    _listing(client, "2", title="Data Engineer", company="Example Company")
    _emit(client, "2", "rejected")
    _listing(client, "3", title="Platform Engineer", company="Example Company")
    _emit(client, "3", "seen")

    body = _count(client, "Example Company")
    assert body == {"company_key": "example company", "count": 2}


def test_skipped_and_closed_carry_no_applied_evidence(client: TestClient) -> None:
    _listing(client, "1", title="SRE", company="Booking")
    _emit(client, "1", "skipped")
    _listing(client, "2", title="DBA", company="Booking")
    _emit(client, "2", "closed")

    assert _count(client, "Booking")["count"] == 0


def test_company_is_normalized_like_the_stored_key(client: TestClient) -> None:
    # Stored as "Example Company N.V.", queried as bare "Example Company": the legal-suffix
    # stripping folds both onto the same advisory company_key.
    _listing(client, "1", title="Backend Engineer", company="Example Company N.V.")
    _emit(client, "1", "applied")

    body = _count(client, "Example Company")
    assert body == {"company_key": "example company", "count": 1}


def test_unknown_or_missing_company_counts_zero(client: TestClient) -> None:
    assert _count(client, "Nonexistent Corp") == {"company_key": "nonexistent", "count": 0}
    # No company param / a name that normalizes to nothing → nothing to match.
    assert _count(client, None) == {"company_key": None, "count": 0}
    assert _count(client, "B.V.") == {"company_key": None, "count": 0}


def test_pure_read_never_materializes_a_row(client: TestClient) -> None:
    _count(client, "Ghost Company")
    resp = client.get("/api/jobs")
    assert resp.status_code == 200
    assert resp.json() == []
