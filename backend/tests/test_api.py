"""Integration tests use actual migrations, request validation and SQLite foreign keys."""

import json
import secrets

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

from backend.hip import main
from backend.hip.db import Run, Trial, database
from backend.hip.schema import Protocol
from backend.hip.trials import make_schedule


@pytest.fixture
def lab(tmp_path, monkeypatch):
    from backend.hip import db as db_module

    engine = create_engine(
        f"sqlite:///{tmp_path / 'lab.sqlite'}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def fk(conn, _record):
        conn.execute("PRAGMA foreign_keys=ON")

    monkeypatch.setattr(db_module, "engine", engine)
    monkeypatch.setattr(main, "engine", engine)
    command.upgrade(Config("backend/alembic.ini"), "head")
    secret = secrets.token_urlsafe()
    monkeypatch.setenv("HIP_RESEARCHER_PASSWORD", secret)

    def connect():
        with Session(engine) as db:
            yield db

    main.app.dependency_overrides[database] = connect
    try:
        with TestClient(main.app) as client:
            yield client, secret, engine
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()


def establish(lab):
    c, password, _ = lab
    assert c.post("/api/auth/login", json={"password": password}).status_code == 200
    study = c.post(
        "/api/studies",
        json={"status": "active", "widths": [24], "distances": [150], "practice_trials": 0},
    ).json()
    enroll = {"study_id": study["id"], "protocol_version": study["protocol_version"], "consent": True}
    run = c.post("/api/sessions", json=enroll).json()
    return study, enroll, run, {"Authorization": "Bearer " + run["token"]}


def body(method="mouse"):
    return {
        "start_x": 50,
        "start_y": 40,
        "target_x": 200,
        "target_y": 40,
        "target_width": 24,
        "started_at_ms": 100,
        "ended_at_ms": 520,
        "outcome": "completed",
        "input_method": method,
        "events": [
            {"type": t, "x": x, "y": 40, "t": s}
            for t, x, s in [
                ("down", 50, 100),
                ("up", 50, 140),
                ("move", 110, 180),
                ("down", 175, 300),
                ("up", 175, 320),
                ("down", 200, 500),
                ("up", 200, 520),
            ]
        ],
    }


def test_access_consent_and_counterbalance(lab):
    client, _, _ = lab
    assert client.get("/api/studies").status_code == 401
    study, enroll, run, headers = establish(lab)
    assert client.post("/api/sessions", json={**enroll, "consent": False}).status_code == 422
    assert client.post("/api/sessions", json={**enroll, "protocol_version": "old"}).status_code == 409
    other = client.post("/api/sessions", json=enroll).json()
    assert run["order"] == other["order"][::-1]
    assert client.get(f"/api/participant/{other['id']}", headers=headers).status_code == 401
    assert client.patch(f"/api/studies/{study['id']}", json={"widths": [34]}).status_code == 409
    assert (
        client.post("/api/auth/logout", headers={"origin": "https://unrelated.example"}).status_code
        == 403
    )
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/sessions").status_code == 401
    assert client.get(f"/api/studies/{study['id']}/export").status_code == 401


def test_real_trial_persistence_retries_and_export(lab):
    c, _, _ = lab
    study, _, run, token = establish(lab)
    url = "/api/participant/" + run["id"]
    payload = body()
    assert c.put(url + "/trials/1", headers=token, json=payload).status_code == 422
    c.patch(url, headers=token, json={"metadata": {"confirmed_method": "mouse"}}).raise_for_status()
    assert c.put(url + "/trials/2", headers=token, json=payload).status_code == 409
    assert c.put(url + "/trials/1", headers=token, json={**payload, "target_x": 130}).status_code == 422
    invalid = json.loads(json.dumps(payload))
    invalid["events"][3]["t"] = 1
    assert c.put(url + "/trials/1", headers=token, json=invalid).status_code == 422
    assert c.put(url + "/trials/1", headers=token, json=payload).json()["next_sequence"] == 2
    assert c.put(url + "/trials/1", headers=token, json=payload).status_code == 200
    assert (
        c.put(url + "/trials/1", headers=token, json={**payload, "ended_at_ms": 521}).status_code == 409
    )
    effort = {"effort_mouse": 3, "effort_trackpad": 4}
    assert c.post(url + "/complete", headers=token, json=effort).status_code == 409
    c.patch(url, headers=token, json={"metadata": {"confirmed_method": "trackpad"}}).raise_for_status()
    interrupted = {
        **body("trackpad"),
        "outcome": "interrupted",
        "interruption_reason": "blur",
        "events": payload["events"][:2],
    }
    c.put(url + "/trials/2", headers=token, json=interrupted).raise_for_status()
    assert c.post(url + "/complete", headers=token, json=effort).json()["status"] == "completed"
    rows = c.get(f"/api/studies/{study['id']}/export").json()
    assert rows[0]["movement_time_ms"] == 200
    assert rows[0]["acquisition_time_ms"] == 400
    assert rows[0]["total_time_ms"] == 420
    assert rows[0]["misses"] == rows[0]["retry_count"] == 1
    assert rows[0]["first_attempt_success"] is False and rows[1]["valid"] is False
    assert rows[1]["session_status"] == "completed"
    assert c.get("/api/dashboard").json()["valid_trials"] == 1
    assert c.get("/api/dashboard").json()["error_rate"] == 1.0
    assert c.get(f"/api/studies/{study['id']}/export?format=csv").text.startswith("sequence,")
    assert c.patch(f"/api/sessions/{run['id']}", json={"eligibility": "excluded"}).status_code == 422
    c.patch(
        f"/api/sessions/{run['id']}",
        json={"eligibility": "excluded", "exclusion_reason": "protocol deviation"},
    ).raise_for_status()
    assert c.get("/api/dashboard").json()["valid_trials"] == 0
    assert c.get(f"/api/studies/{study['id']}/export").json()[0]["eligibility"] == "excluded"


def test_withdraw_delete_and_retention(lab):
    c, _, engine = lab
    study, enroll, run, token = establish(lab)
    url = "/api/participant/" + run["id"]
    c.patch(url, headers=token, json={"metadata": {"confirmed_method": "mouse"}}).raise_for_status()
    c.put(url + "/trials/1", headers=token, json=body()).raise_for_status()
    assert c.post(url + "/withdraw", headers=token).json()["status"] == "withdrawn"
    assert c.get("/api/dashboard").json()["valid_trials"] == 0
    assert (
        c.patch(url, headers=token, json={"metadata": {"confirmed_method": "mouse"}}).status_code == 409
    )
    assert c.delete(url, headers=token).status_code == 204
    assert c.get(url, headers=token).status_code == 401
    assert c.get(f"/api/studies/{study['id']}/export").json() == []
    old = c.post("/api/sessions", json=enroll).json()
    with Session(engine) as db:
        row = db.get(Run, old["id"])
        assert row is not None
        row.expires = 1
        db.commit()
        main.purge(db)
        assert db.scalar(select(func.count()).select_from(Run)) == 0
        assert db.scalar(select(func.count()).select_from(Trial)) == 0


def test_randomization_reproducible_balanced():
    protocol = Protocol(repetitions=2)
    schedule = make_schedule(protocol, 1, "seed")
    assert schedule == make_schedule(protocol, 1, "seed")
    for method in ["mouse", "trackpad"]:
        cells = [
            (s["width"], s["distance"])
            for s in schedule
            if s["input_method"] == method and not s["practice"]
        ]
        assert len(cells) == 18 and len(set(cells[:9])) == len(set(cells[9:])) == 9


def test_enrollment_replay_preserves_assignment_and_token(lab):
    c, _, _ = lab
    _, enrollment, first, _ = establish(lab)
    enrollment["enrollment_key"] = secrets.token_hex(32)
    second = c.post("/api/sessions", json=enrollment).json()
    retry = c.post("/api/sessions", json=enrollment).json()
    assert second["id"] == retry["id"] and second["token"] == retry["token"]
    assert second["order"] == first["order"][::-1]
    third = c.post("/api/sessions", json={**enrollment, "enrollment_key": secrets.token_hex(32)}).json()
    assert third["order"] == first["order"]
    assert c.get("/api/dashboard").json()["participants"] == 3


def test_private_analysis_and_report(lab):
    c, _, _ = lab
    study, _, run, token = establish(lab)
    base = f"/api/studies/{study['id']}"
    assert c.get(base + "/analysis").json()["quality"]["source"] == "real"
    url = "/api/participant/" + run["id"]
    c.patch(url, headers=token, json={"metadata": {"confirmed_method": "mouse"}}).raise_for_status()
    c.put(url + "/trials/1", headers=token, json=body()).raise_for_status()
    compressed = c.get(base + "/export?include_events=false").json()
    assert len(compressed) == 1 and "events" not in compressed[0]
    assert c.get(base + "/export?session_id=unknown").json() == []
    analysis = c.get(base + "/analysis").json()
    assert analysis["quality"]["eligible_rows"] == 1 and analysis["paired"]["n_participants"] == 0
    pdf = c.get(base + "/report.pdf")
    assert pdf.headers["content-type"] == "application/pdf" and pdf.content.startswith(b"%PDF")
    c.post("/api/auth/logout")
    assert c.get(base + "/report.pdf").status_code == 401


def test_concurrent_consent_replay_is_a_single_assignment(lab):
    from concurrent.futures import ThreadPoolExecutor

    client, _, _ = lab
    _, payload, _, _ = establish(lab)
    payload["enrollment_key"] = secrets.token_hex(32)
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: client.post("/api/sessions", json=payload), range(8)))
    assert all(r.status_code == 201 for r in responses)
    assert len({r.json()["id"] for r in responses}) == 1
    assert client.get("/api/dashboard").json()["participants"] == 2


def test_report_history_preserves_only_study_metadata(lab):
    client, _, _ = lab
    assert client.get("/api/reports").status_code == 401
    study, _, _, _ = establish(lab)
    assert client.get("/api/reports").json() == []
    response = client.post(f"/api/studies/{study['id']}/reports")
    assert response.status_code == 200 and response.content.startswith(b"%PDF")
    recent = client.get("/api/reports").json()
    assert len(recent) == 1 and recent[0]["study_id"] == study["id"]
    assert set(recent[0]) == {"title", "study_id", "generated_at"}


def test_moderated_workflow_access_and_consent(lab):
    client, password, _ = lab
    root = "/api/moderated"
    assert client.get(root + "/studies").status_code == 401
    client.post("/api/auth/login", json={"password": password})
    protocol = {
        "title": "Settings",
        "objective": "Observe preferences.",
        "tasks": ["Find settings", "Save"],
    }
    assert (
        client.post(root + "/studies", json={**protocol, "prototype_url": "javascript:test"}).status_code
        == 422
    )
    study = client.post(root + "/studies", json=protocol).json()
    base = root + "/studies/" + study["id"]
    receipt = secrets.token_hex(32)
    enrollment = {"consent": True, "receipt": receipt}
    assert client.post(base + "/enroll", json={**enrollment, "consent": False}).status_code == 422
    sid = client.post(base + "/enroll", json=enrollment).json()["id"]
    assert sid == client.post(base + "/enroll", json=enrollment).json()["id"]
    headers = {"Authorization": "Bearer " + receipt}
    participant = root + "/participant/" + sid
    monitor = root + "/sessions/" + sid
    assert client.get(participant).status_code == 401
    assert (
        client.post(monitor + "/outcomes", json={"revision": 0, "outcome": "assisted"}).status_code
        == 409
    )
    assert (
        client.post(participant, headers=headers, json={"revision": 0, "action": "start"}).json()[
            "phase"
        ]
        == "working"
    )
    assert (
        client.post(monitor + "/notes", json={"revision": 1, "text": "Needed a hint."}).status_code
        == 200
    )
    assert (
        client.post(monitor + "/notes", json={"revision": 1, "text": "Stale edit."}).status_code == 409
    )
    assert "timeline" not in client.get(participant, headers=headers).json()
    assert (
        client.post(participant, headers=headers, json={"revision": 2, "action": "review"}).json()[
            "phase"
        ]
        == "review"
    )
    assert (
        client.post(monitor + "/outcomes", json={"revision": 3, "outcome": "assisted"}).json()[
            "position"
        ]
        == 1
    )
    client.post(participant, headers=headers, json={"revision": 4, "action": "start"})
    result = client.post(monitor + "/outcomes", json={"revision": 5, "outcome": "independent"}).json()
    assert result["phase"] == "completed"
    assert [e["position"] for e in result["timeline"]] == [0, 0, 0, 0, 1, 1]
    assert (
        client.post(participant, headers=headers, json={"revision": 6, "action": "withdraw"}).json()[
            "phase"
        ]
        == "withdrawn"
    )
    assert client.post(monitor + "/notes", json={"revision": 7, "text": "Closed"}).status_code == 409
    assert client.delete(participant, headers=headers).status_code == 204
    assert client.get(base + "/sessions").json() == []
    assert client.get(monitor).status_code == 404
