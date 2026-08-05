"""GET /stats: the dashboard-wide funnel/apply-type rollup (app/stats)."""

from typing import Any

from fastapi.testclient import TestClient


def _listing(client: TestClient, platform: str, platform_id: str, **extra: Any) -> dict[str, Any]:
    resp = client.post(
        "/api/listings", json={"platform": platform, "platform_id": platform_id, **extra}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _emit(client: TestClient, job_id: str, event: str) -> None:
    resp = client.post("/api/events", json={"job_id": job_id, "events": [{"event": event}]})
    assert resp.status_code == 200, resp.text


def test_empty_db_is_zeroed(client: TestClient) -> None:
    stats = client.get("/api/stats").json()
    assert stats == {"total_jobs": 0, "funnel": {}, "apply_type": {}}


def test_funnel_counts_group_jobs_by_status(client: TestClient) -> None:
    _listing(client, "linkedin", "1")  # status: new
    b = _listing(client, "linkedin", "2")  # -> seen
    c = _listing(client, "linkedin", "3")  # -> seen
    _emit(client, b["job_id"], "seen")
    _emit(client, c["job_id"], "seen")

    stats = client.get("/api/stats").json()
    assert stats["total_jobs"] == 3
    assert stats["funnel"] == {"new": 1, "seen": 2}


def test_apply_type_counts_group_listings_and_bucket_missing_as_unknown(client: TestClient) -> None:
    _listing(client, "linkedin", "1", apply_type="easy_apply")
    _listing(client, "linkedin", "2", apply_type="easy_apply")
    _listing(client, "linkedin", "3", apply_type="external")
    _listing(client, "linkedin", "4")  # apply_type omitted -> NULL -> "unknown"

    stats = client.get("/api/stats").json()
    assert stats["apply_type"] == {"easy_apply": 2, "external": 1, "unknown": 1}


def test_apply_type_counts_by_listing_not_by_job(client: TestClient) -> None:
    # Two listings on the SAME job, different apply_types — each listing counts
    # separately (apply_type is a listing-level field, unlike funnel status).
    a = _listing(client, "linkedin", "1", apply_type="easy_apply")
    _listing(client, "exampleboard", "JR_1", apply_type="external", job_id=a["job_id"])

    stats = client.get("/api/stats").json()
    assert stats["total_jobs"] == 1
    assert stats["apply_type"] == {"easy_apply": 1, "external": 1}
