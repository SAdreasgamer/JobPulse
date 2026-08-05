"""The rich-context surfaces: job `meta` overlay + its vocabulary, editing an
event's meta after the fact, and the document update/delete lifecycle."""

from typing import Any

from fastapi.testclient import TestClient


def _job(client: TestClient, platform: str, platform_id: str, **extra: Any) -> str:
    body = {"platform": platform, "platform_id": platform_id, **extra}
    return client.post("/api/listings", json=body).json()["job_id"]


# --- job meta overlay --------------------------------------------------------


def test_meta_defaults_to_empty_and_round_trips(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    assert client.get(f"/api/jobs/{job_id}").json()["meta"] == {}

    r = client.patch(f"/api/jobs/{job_id}", json={"meta": {"referred": True, "score": 8}})
    assert r.status_code == 200
    assert r.json()["meta"] == {"referred": True, "score": 8}
    assert client.get(f"/api/jobs/{job_id}").json()["meta"] == {"referred": True, "score": 8}


def test_meta_replaces_whole_bag_and_omitting_it_leaves_it_alone(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    client.patch(f"/api/jobs/{job_id}", json={"meta": {"a": 1, "b": 2}})
    # A title-only patch must not wipe meta.
    client.patch(f"/api/jobs/{job_id}", json={"title": "B"})
    assert client.get(f"/api/jobs/{job_id}").json()["meta"] == {"a": 1, "b": 2}
    # meta is a full replace, not a merge.
    client.patch(f"/api/jobs/{job_id}", json={"meta": {"c": 3}})
    assert client.get(f"/api/jobs/{job_id}").json()["meta"] == {"c": 3}


def test_meta_shows_up_in_board_summary(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    client.patch(f"/api/jobs/{job_id}", json={"meta": {"took_contact": True}})
    summary = next(j for j in client.get("/api/jobs").json() if j["id"] == job_id)
    assert summary["meta"] == {"took_contact": True}


# --- meta vocabulary ---------------------------------------------------------


def test_vocabulary_ranks_keys_by_use_with_values_and_type(client: TestClient) -> None:
    a = _job(client, "linkedin", "1", title="A")
    b = _job(client, "linkedin", "2", title="B")
    client.patch(f"/api/jobs/{a}", json={"meta": {"referred": True, "source": "recruiter"}})
    client.patch(f"/api/jobs/{b}", json={"meta": {"referred": False}})

    vocab = client.get("/api/meta/vocabulary").json()
    assert vocab["entity"] == "jobs"
    keys = {k["key"]: k for k in vocab["keys"]}
    # `referred` used twice ranks ahead of `source`.
    assert [k["key"] for k in vocab["keys"]][0] == "referred"
    assert keys["referred"]["uses"] == 2
    assert keys["referred"]["type"] == "boolean"
    assert set(keys["referred"]["values"]) == {"true", "false"}
    assert keys["source"]["type"] == "text"
    assert keys["source"]["values"] == ["recruiter"]


def test_vocabulary_unknown_entity_is_empty(client: TestClient) -> None:
    r = client.get("/api/meta/vocabulary", params={"entity": "widgets"})
    assert r.status_code == 200
    assert r.json() == {"entity": "widgets", "keys": []}


# --- event meta edit -----------------------------------------------------


def test_event_meta_can_be_edited_after_the_fact(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "applied"}]})
    ev = next(
        e for e in client.get(f"/api/jobs/{job_id}").json()["events"] if e["event"] == "applied"
    )
    assert ev["meta"] is None

    r = client.patch(f"/api/events/{ev['id']}", json={"meta": {"note": "referred by Sam"}})
    assert r.status_code == 200
    assert r.json()["meta"] == {"note": "referred by Sam"}
    # Verb, timestamp, and therefore status are untouched.
    assert r.json()["event"] == "applied"
    assert r.json()["ts"] == ev["ts"]
    assert client.get(f"/api/jobs/{job_id}").json()["status"] == "applied"


def test_edit_missing_event_is_404(client: TestClient) -> None:
    assert client.patch("/api/events/99999", json={"meta": {"note": "x"}}).status_code == 404


def test_event_ts_can_be_corrected_without_touching_meta_or_verb(client: TestClient) -> None:
    # A rejection captured at scan time; its real received time is corrected later.
    job_id = _job(client, "linkedin", "1", title="A")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "applied"}]})
    ev = next(
        e for e in client.get(f"/api/jobs/{job_id}").json()["events"] if e["event"] == "applied"
    )
    client.patch(f"/api/events/{ev['id']}", json={"meta": {"note": "keep me"}})

    r = client.patch(f"/api/events/{ev['id']}", json={"ts": "2026-06-01T09:30:00+00:00"})
    assert r.status_code == 200
    assert r.json()["ts"] == "2026-06-01T09:30:00+00:00"
    # A ts-only edit must NOT clobber the meta, and never touches verb/status.
    assert r.json()["meta"] == {"note": "keep me"}
    assert r.json()["event"] == "applied"
    assert client.get(f"/api/jobs/{job_id}").json()["status"] == "applied"


def test_event_ts_and_meta_can_move_together(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "applied"}]})
    ev = next(
        e for e in client.get(f"/api/jobs/{job_id}").json()["events"] if e["event"] == "applied"
    )

    r = client.patch(
        f"/api/events/{ev['id']}",
        json={"ts": "2026-05-05T00:00:00+00:00", "meta": {"note": "both"}},
    )
    assert r.json()["ts"] == "2026-05-05T00:00:00+00:00"
    assert r.json()["meta"] == {"note": "both"}


def test_ts_edit_on_status_event_reprojects(client: TestClient) -> None:
    # Moving a status-bearing event's ts reorders the latest-ts projection: backdating
    # the ts-newest of two status events hands the projection back to the other.
    job_id = _job(client, "linkedin", "1", title="A")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "applied"}]})
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "in_process"}]})
    assert client.get(f"/api/jobs/{job_id}").json()["status"] == "in_process"
    ip = next(
        e for e in client.get(f"/api/jobs/{job_id}").json()["events"] if e["event"] == "in_process"
    )
    client.patch(f"/api/events/{ip['id']}", json={"ts": "2020-01-01T00:00:00+00:00"})
    # applied is now the ts-newest status event → it owns the projection.
    assert client.get(f"/api/jobs/{job_id}").json()["status"] == "applied"


def test_meta_only_edit_leaves_ts_unchanged(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "applied"}]})
    ev = next(
        e for e in client.get(f"/api/jobs/{job_id}").json()["events"] if e["event"] == "applied"
    )

    r = client.patch(f"/api/events/{ev['id']}", json={"meta": {"note": "only meta"}})
    assert r.json()["ts"] == ev["ts"]  # ts untouched when not sent


# --- document lifecycle ------------------------------------------------------


def test_document_can_be_updated_and_deleted(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    doc = client.post(
        f"/api/jobs/{job_id}/documents", json={"type": "cover_letter", "requested": "required"}
    ).json()
    assert doc["provided"] is False

    r = client.patch(
        f"/api/documents/{doc['id']}", json={"provided": True, "content": "Dear team, ..."}
    )
    assert r.status_code == 200
    assert r.json()["provided"] is True
    assert r.json()["content"] == "Dear team, ..."
    assert r.json()["requested"] == "required"  # untouched fields survive

    assert client.delete(f"/api/documents/{doc['id']}").status_code == 204
    assert client.get(f"/api/jobs/{job_id}").json()["documents"] == []


def test_update_and_delete_missing_document_is_404(client: TestClient) -> None:
    assert client.patch("/api/documents/99999", json={"provided": True}).status_code == 404
    assert client.delete("/api/documents/99999").status_code == 404


def test_notes_document_type_is_retired(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    # `notes` is an event type, not a valid document type.
    r = client.post(f"/api/jobs/{job_id}/documents", json={"type": "notes", "content": "x"})
    assert r.status_code == 422


# --- manual note (log) events ------------------------------------------------


def _note(client: TestClient, job_id: str, text: str):
    return client.post(
        "/api/events",
        json={"job_id": job_id, "events": [{"event": "note", "meta": {"note": text}}]},
    )


def test_note_is_logged_without_touching_status(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "applied"}]})

    r = _note(client, job_id, "recruiter called")
    assert r.status_code == 200
    assert r.json()["status"] == "applied"  # note leaves status put

    detail = client.get(f"/api/jobs/{job_id}").json()
    notes = [e for e in detail["events"] if e["event"] == "note"]
    assert len(notes) == 1
    assert notes[0]["meta"] == {"note": "recruiter called"}
    assert detail["status"] == "applied"


def test_note_is_always_logged_even_when_repeated(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    _note(client, job_id, "same")
    _note(client, job_id, "same")
    detail = client.get(f"/api/jobs/{job_id}").json()
    assert len([e for e in detail["events"] if e["event"] == "note"]) == 2


def test_note_does_not_interfere_with_undo(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "applied"}]})
    _note(client, job_id, "a note in between")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "in_process"}]})

    # Undo drops the last *status* event (in_process), skipping the note entirely.
    r = client.post(f"/api/jobs/{job_id}/status/revert")
    assert r.json()["status"] == "applied"
    detail = client.get(f"/api/jobs/{job_id}").json()
    assert len([e for e in detail["events"] if e["event"] == "note"]) == 1  # note survives


def test_note_event_can_be_deleted(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    _note(client, job_id, "oops")
    note = next(
        e for e in client.get(f"/api/jobs/{job_id}").json()["events"] if e["event"] == "note"
    )

    assert client.delete(f"/api/events/{note['id']}").status_code == 204
    assert [
        e for e in client.get(f"/api/jobs/{job_id}").json()["events"] if e["event"] == "note"
    ] == []


def test_deleting_a_status_event_is_refused(client: TestClient) -> None:
    job_id = _job(client, "linkedin", "1", title="A")
    client.post("/api/events", json={"job_id": job_id, "events": [{"event": "applied"}]})
    applied = next(
        e for e in client.get(f"/api/jobs/{job_id}").json()["events"] if e["event"] == "applied"
    )
    # Status rows are audit-critical: raw delete is refused (revert/correct instead).
    assert client.delete(f"/api/events/{applied['id']}").status_code == 400
    assert client.get(f"/api/jobs/{job_id}").json()["status"] == "applied"


def test_note_titles_vocabulary_ranks_by_use(client: TestClient) -> None:
    a = _job(client, "linkedin", "1", title="A")
    b = _job(client, "linkedin", "2", title="B")

    def titled(job_id: str, title: str) -> None:
        client.post(
            "/api/events",
            json={"job_id": job_id, "events": [{"event": "note", "meta": {"title": title}}]},
        )

    titled(a, "Phone screen")
    titled(b, "Phone screen")
    titled(a, "Follow-up")
    _note(client, a, "a body-only note with no title")  # excluded (no title)

    titles = client.get("/api/meta/note-titles").json()
    assert titles == ["Phone screen", "Follow-up"]  # most-used first, untitled omitted


# --- health probe ------------------------------------------------------------


def test_health_endpoint_is_ok(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
