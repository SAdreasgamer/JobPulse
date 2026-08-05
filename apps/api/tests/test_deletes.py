"""DELETE /jobs/{id} and DELETE /listings/{id}: cascade, job-dissolve on last
listing, provenance handling, and cross-job isolation."""

from typing import Any

from fastapi.testclient import TestClient


def _listing(client: TestClient, platform: str, platform_id: str, **extra: Any) -> dict[str, Any]:
    resp = client.post(
        "/api/listings", json={"platform": platform, "platform_id": platform_id, **extra}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _emit(client: TestClient, platform: str, platform_id: str, event: str) -> None:
    resp = client.post(
        "/api/events",
        json={"platform": platform, "platform_id": platform_id, "events": [{"event": event}]},
    )
    assert resp.status_code == 200, resp.text


def test_delete_job_cascades_and_leaves_other_jobs_untouched(client: TestClient) -> None:
    target = _listing(client, "linkedin", "1", title="Doomed")
    job_id = target["job_id"]
    _emit(client, "linkedin", "1", "seen")
    client.post(f"/api/jobs/{job_id}/documents", json={"type": "cover_letter", "content": "x"})

    # A second, unrelated job that must survive intact.
    other = _listing(client, "linkedin", "2", title="Keeper")
    _emit(client, "linkedin", "2", "starred")

    resp = client.delete(f"/api/jobs/{job_id}")
    assert resp.status_code == 204
    assert resp.content == b""

    # Job and all its children are gone.
    assert client.get(f"/api/jobs/{job_id}").status_code == 404
    # The deleted listing's natural key now reads as untracked (row removed).
    state = client.get(
        "/api/jobs/states", params={"platform": "linkedin", "platform_ids": ["1"]}
    ).json()
    assert state[0]["status"] == "untracked"

    # The other job is fully intact.
    keep = client.get(f"/api/jobs/{other['job_id']}").json()
    assert keep["title"] == "Keeper"
    assert keep["starred"] is True
    assert len(keep["listings"]) == 1


def test_delete_listing_keeps_multi_listing_job_and_drops_provenance(client: TestClient) -> None:
    a = _listing(client, "linkedin", "1", title="Backend")
    job_id = a["job_id"]
    _listing(client, "exampleboard", "JR_1", title="Backend", job_id=job_id)
    _emit(client, "linkedin", "1", "seen")  # event tagged with the linkedin listing

    resp = client.delete(f"/api/listings/{a['listing_id']}")
    assert resp.status_code == 204

    detail = client.get(f"/api/jobs/{job_id}").json()
    # Job survives with only the exampleboard listing left.
    assert [row["platform"] for row in detail["listings"]] == ["exampleboard"]
    # The seen event is kept as job history, but its listing provenance is nulled.
    seen = [e for e in detail["events"] if e["event"] == "seen"]
    assert len(seen) == 1
    assert seen[0]["listing_id"] is None


def test_delete_last_listing_dissolves_the_job(client: TestClient) -> None:
    only = _listing(client, "demoboard", "9401", title="Data Engineer")
    job_id = only["job_id"]

    resp = client.delete(f"/api/listings/{only['listing_id']}")
    assert resp.status_code == 204
    # Last listing gone → the now-empty job is dissolved.
    assert client.get(f"/api/jobs/{job_id}").status_code == 404


def test_delete_missing_returns_404(client: TestClient) -> None:
    assert client.delete("/api/jobs/nope").status_code == 404
    assert client.delete("/api/listings/LI-nope").status_code == 404
