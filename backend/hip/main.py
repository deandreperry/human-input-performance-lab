"""Local HIP Lab API. Researcher and participant credentials have separate scopes."""

import csv
import hashlib
import hmac
import io
import json
import os
import secrets
from collections import deque
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from threading import Lock
from typing import Annotated, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import JSON, cast, delete, func, select, type_coerce, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from .calculations import routes as calculation_routes
from .db import Login, Run, Study, Trial, UsabilitySession, database, engine, now, uid
from .moderated import routers as moderated_routes
from .schema import (
    Attempt,
    Details,
    Effort,
    Enrollment,
    EnrollmentView,
    ManagedRun,
    Management,
    ParticipantView,
    Password,
    Protocol,
    Receipt,
    RunSummary,
    StudyView,
)
from .trials import make_schedule, score


def purge(db: Session):
    db.execute(delete(Run).where(Run.expires <= now()))
    db.execute(delete(Login).where(Login.expires <= now()))
    db.execute(delete(UsabilitySession).where(UsabilitySession.expires <= now()))
    db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio

    from starlette.concurrency import run_in_threadpool

    def sweep():
        with Session(engine) as db:
            purge(db)

    async def retention():
        while True:
            await asyncio.sleep(3600)
            await run_in_threadpool(sweep)

    await run_in_threadpool(sweep)
    worker = asyncio.create_task(retention())
    try:
        yield
    finally:
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)


app = FastAPI(title="Human Input Performance Lab", version="1.0", lifespan=lifespan)
router = APIRouter(prefix="/api")
DB = Annotated[Session, Depends(database)]


@app.middleware("http")
async def local_headers(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin:
        # Desktop UI may use the Next same-origin reverse proxy.
        allowed = os.getenv("HIP_FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/")
        same = (
            urlparse(origin).netloc == request.headers.get("host")
            and urlparse(origin).scheme == request.url.scheme
        )
        if not same and origin not in {allowed, "http://127.0.0.1:3000"}:
            return JSONResponse({"detail": "Unexpected request origin."}, status_code=403)
    response = await call_next(request)
    response.headers.update(
        {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
        }
    )
    return response


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def admin(request: Request, db: DB):
    cookie = request.cookies.get("hip_researcher")
    login = db.get(Login, digest(cookie)) if cookie else None
    if not login or login.expires <= now():
        raise HTTPException(401, "Researcher sign-in required.")


private = APIRouter(dependencies=[Depends(admin)])
failures: deque[int] = deque()
guard = Lock()


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/auth/login")
def login(password: Password, response: Response, db: DB):
    expected = os.getenv("HIP_RESEARCHER_PASSWORD", "")
    if len(expected) < 12:
        raise HTTPException(503, "Set HIP_RESEARCHER_PASSWORD to at least 12 characters.")
    with guard:
        while failures and failures[0] < now() - 60:
            failures.popleft()
        if len(failures) >= 10:
            raise HTTPException(429, "Too many attempts. Try again after one minute.")
        if not hmac.compare_digest(digest(password.password), digest(expected)):
            failures.append(now())
            raise HTTPException(401, "Incorrect password.")
    token = secrets.token_urlsafe(32)
    db.add(Login(digest=digest(token), expires=now() + 28800))
    db.commit()
    response.set_cookie(
        "hip_researcher",
        token,
        httponly=True,
        samesite="strict",
        max_age=28800,
        secure=os.getenv("HIP_SECURE_COOKIE", "").lower() == "true",
        path="/api",
    )
    return {"authenticated": True}


@private.post("/auth/logout")
def logout(request: Request, response: Response, db: DB):
    db.execute(delete(Login).where(Login.digest == digest(request.cookies["hip_researcher"])))
    db.commit()
    response.delete_cookie("hip_researcher", path="/api")
    return {"authenticated": False}


@private.get("/auth/me")
def me():
    return {"authenticated": True}


def lookup(db: Session, study_id: str) -> Study:
    study = db.get(Study, study_id)
    if not study:
        raise HTTPException(404, "Study not found.")
    return study


def describe(s: Study) -> dict:
    return {"id": s.id, "created_at": s.created, **s.config}


@private.get("/studies", response_model=list[StudyView])
def studies(db: DB):
    return [describe(s) for s in db.scalars(select(Study).order_by(Study.created.desc(), Study.id))]


@private.get("/studies/{study_id}", response_model=StudyView)
def study(study_id: str, db: DB):
    return describe(lookup(db, study_id))


@private.post("/studies", status_code=201, response_model=StudyView)
def create(payload: Protocol, db: DB):
    s = Study(config=payload.model_dump())
    db.add(s)
    db.commit()
    return describe(s)


@private.patch("/studies/{study_id}", response_model=StudyView)
def revise(study_id: str, payload: dict, db: DB):
    from pydantic import ValidationError

    s = lookup(db, study_id)
    try:
        updated = Protocol.model_validate({**s.config, **payload}).model_dump()
    except ValidationError as exc:
        raise HTTPException(422, str(exc)) from exc
    changing_protocol = any(updated[k] != s.config[k] for k in updated if k != "status")
    if s.assignments and (changing_protocol or updated["status"] == "draft"):
        raise HTTPException(
            409, "Enrollment locks the protocol. Create a new study for revised methods."
        )
    statement = (
        update(Study).where(Study.id == s.id, Study.assignments == s.assignments).values(config=updated)
    )
    if db.scalar(statement.returning(Study.id)) is None:
        raise HTTPException(409, "Study changed during editing. Reload.")
    db.commit()
    return describe(s)


@router.get("/public/studies/{study_id}", response_model=StudyView)
def public(study_id: str, db: DB):
    s = lookup(db, study_id)
    if s.config["status"] != "active":
        raise HTTPException(404, "Enrollment is closed.")
    return describe(s)


def summary(r: Run) -> dict:
    return {
        "id": r.id,
        "study_id": r.study_id,
        "participant_id": r.participant_id,
        "protocol_version": r.protocol["protocol_version"],
        "status": r.status,
        "order": list(dict.fromkeys(p["input_method"] for p in r.schedule)),
        "next_sequence": r.next_sequence,
        "completed_trials": r.next_sequence - 1,
        "total_trials": len(r.schedule),
        "consent_at": r.consent_at,
        "started_at": datetime.fromtimestamp(r.consent_at, UTC).isoformat(),
        "trial_count": r.next_sequence - 1,
        "expires_at": r.expires,
        "metadata": r.info,
        "effort": r.questionnaire,
        "break_interval": r.protocol["break_interval"],
    }


def participant_view(r: Run):
    return {
        **summary(r),
        "protocol": {"id": r.study_id, **r.protocol},
        "schedule": r.schedule,
        "record_trajectory": r.protocol["record_trajectory"],
    }


@router.post("/sessions", status_code=201, response_model=EnrollmentView)
def enroll(payload: Enrollment, db: DB):
    # Atomic assignment avoids duplicating order in concurrent enrollments.
    study = lookup(db, payload.study_id)
    assignment = db.scalar(
        update(Study)
        .where(Study.id == study.id)
        .values(assignments=Study.assignments + 1)
        .returning(Study.assignments)
    )
    # The study update above serializes allocation and recovery for this study.
    # A client-created 256-bit receipt secret lets a lost response be retried
    # without retaining recoverable bearer tokens in the database.
    token = (
        digest(f"hip-enrollment-v1/{study.id}/{payload.enrollment_key}")
        if payload.enrollment_key
        else secrets.token_urlsafe(32)
    )
    if payload.enrollment_key:
        existing = db.scalar(
            select(Run).where(Run.study_id == study.id, Run.secret_hash == digest(token))
        )
        if existing:
            db.rollback()  # An idempotent replay must not consume an assignment.
            if (
                existing.expires <= now()
                or existing.protocol["protocol_version"] != payload.protocol_version
            ):
                raise HTTPException(
                    409, "This consent receipt no longer matches an available enrollment."
                )
            return {**participant_view(existing), "token": token}
    db.refresh(study)
    cfg = Protocol.model_validate(study.config)
    if cfg.status != "active" or cfg.protocol_version != payload.protocol_version:
        raise HTTPException(
            409, "Enrollment closed or protocol changed. Review current consent information."
        )
    assert assignment is not None
    seed = secrets.token_hex(8)
    r = Run(
        participant_id="P-" + secrets.token_hex(6).upper(),
        study_id=study.id,
        secret_hash=digest(token),
        consent_at=now(),
        expires=now() + cfg.retention_days * 86400,
        seed=seed,
        protocol=cfg.model_dump(),
        schedule=make_schedule(cfg, assignment, seed),
    )
    db.add(r)
    db.commit()
    return {**participant_view(r), "token": token}


def participant(session_id: str, db: DB, authorization: Annotated[str | None, Header()] = None) -> Run:
    r = db.get(Run, session_id)
    if (
        not authorization
        or not authorization.startswith("Bearer ")
        or not r
        or r.expires <= now()
        or not hmac.compare_digest(digest(authorization[7:]), r.secret_hash)
    ):
        raise HTTPException(401, "A valid participant session token is required.")
    return r


Participant = Annotated[Run, Depends(participant)]


@router.get("/participant/{session_id}", response_model=ParticipantView)
def resume(r: Participant):
    return participant_view(r)


def active_stmt(r: Run):
    return update(Run).where(
        Run.id == r.id, Run.status == "in_progress", Run.next_sequence == r.next_sequence
    )


def changed(result):
    if result.rowcount != 1:
        raise HTTPException(409, "Session has changed. Reload your progress.")


@router.patch("/participant/{session_id}", response_model=ParticipantView)
def details(payload: Details, r: Participant, db: DB):
    data = payload.metadata.model_dump(exclude_none=True)
    changed(db.execute(active_stmt(r).values(info={**r.info, **data})))
    db.commit()
    return participant_view(r)


@router.put("/participant/{session_id}/trials/{sequence}", response_model=Receipt)
def record(sequence: int, payload: Attempt, r: Participant, db: DB):
    body_hash = digest(json.dumps(payload.model_dump(), sort_keys=True))
    saved = db.scalar(select(Trial).where(Trial.session_id == r.id, Trial.sequence == sequence))
    if saved:
        if not hmac.compare_digest(saved.digest, body_hash):
            raise HTTPException(409, "A different record exists for this trial.")
        return {"next_sequence": r.next_sequence, "status": r.status}
    if sequence != r.next_sequence or not 1 <= sequence <= len(r.schedule):
        raise HTTPException(409, "Submit the currently assigned trial.")
    plan = r.schedule[sequence - 1]
    try:
        derived = score(payload, plan, r.info)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not r.protocol["record_trajectory"] and any(e.type == "move" for e in payload.events):
        raise HTTPException(422, "Trajectory capture is disabled in this protocol.")
    changed(db.execute(active_stmt(r).values(next_sequence=sequence + 1)))
    db.add(Trial(id=uid(), session_id=r.id, sequence=sequence, digest=body_hash, record=derived))
    db.commit()
    return {"next_sequence": sequence + 1, "status": r.status}


@router.post("/participant/{session_id}/complete", response_model=RunSummary)
def complete(payload: Effort, r: Participant, db: DB):
    if r.next_sequence != len(r.schedule) + 1:
        raise HTTPException(409, "The assigned trial schedule is unfinished.")
    if r.status == "completed" and r.questionnaire == payload.model_dump():
        return summary(r)
    changed(db.execute(active_stmt(r).values(status="completed", questionnaire=payload.model_dump())))
    db.commit()
    return summary(r)


@router.post("/participant/{session_id}/withdraw", response_model=RunSummary)
def withdraw(r: Participant, db: DB):
    db.execute(update(Run).where(Run.id == r.id).values(status="withdrawn"))
    db.commit()
    return summary(r)


@router.delete("/participant/{session_id}", status_code=204)
def erase(r: Participant, db: DB):
    db.delete(r)
    db.commit()
    return Response(status_code=204)


def private_view(r: Run):
    return {
        **summary(r),
        "notes": "",
        "eligibility": "pending",
        "verified_methods": [],
        **{k: v for k, v in r.management.items() if k != "review_history"},
    }


@private.get("/sessions", response_model=list[ManagedRun])
def sessions(db: DB, study_id: str | None = None):
    q = select(Run).where(Run.expires > now())
    if study_id:
        q = q.where(Run.study_id == study_id)
    return [private_view(r) for r in db.scalars(q.order_by(Run.consent_at.desc(), Run.id))]


def private_run(session_id: str, db: Session) -> Run:
    r = db.get(Run, session_id)
    if not r or r.expires <= now():
        raise HTTPException(404, "Session not found.")
    return r


@private.patch("/sessions/{session_id}", response_model=ManagedRun)
def manage(session_id: str, payload: Management, db: DB):
    r = private_run(session_id, db)
    revision = {**r.management, **payload.model_dump(exclude_none=True)}
    if revision.get("eligibility") == "excluded" and not revision.get("exclusion_reason"):
        raise HTTPException(422, "Document the exclusion reason.")
    reviewed = {
        k: v
        for k, v in payload.model_dump(exclude_none=True).items()
        if k != "notes" and v != r.management.get(k)
    }
    if reviewed:
        revision["review_history"] = [
            *r.management.get("review_history", []),
            {"at": now(), "actor": "researcher", "changes": reviewed},
        ]
    r.management = revision
    db.commit()
    return private_view(r)


@private.get("/sessions/{session_id}/audit")
def review_history(session_id: str, db: DB):
    return private_run(session_id, db).management.get("review_history", [])


@private.delete("/sessions/{session_id}", status_code=204)
def admin_erase(session_id: str, db: DB):
    return erase(private_run(session_id, db), db)


def records(db: Session, study_id: str, include_events: bool = True, session_id: str | None = None):
    # Retrieve the frozen protocol and randomization schedule once per session.
    runs_query = select(Run).where(Run.study_id == study_id, Run.expires > now())
    if session_id:
        runs_query = runs_query.where(Run.id == session_id)
    runs = {r.id: r for r in db.scalars(runs_query)}
    document = Trial.record.expression
    if not include_events:
        # Drop the large event array inside the database for overview requests.
        if db.get_bind().dialect.name == "postgresql":
            document = cast(document, JSONB).op("-")("events")
        else:
            document = type_coerce(func.json_remove(document, "$.events"), JSON)
    query = (
        select(Trial.id, Trial.session_id, document)
        .join(Run, Run.id == Trial.session_id)
        .where(Run.study_id == study_id, Run.expires > now())
        .order_by(Trial.session_id, Trial.sequence)
    )
    if session_id:
        query = query.where(Trial.session_id == session_id)
    for trial_id, run_id, record in db.execute(query):
        r = runs.get(run_id)
        if r is None:
            continue
        yield {
            **record,
            "trial_id": trial_id,
            "study_id": r.study_id,
            "session_id": r.id,
            "participant_id": r.participant_id,
            "protocol_version": r.protocol["protocol_version"],
            "order": "-".join(dict.fromkeys(p["input_method"] for p in r.schedule)),
            "seed": r.seed,
            "source": "real",
            "session_status": r.status,
            "eligibility": r.management.get("eligibility", "pending"),
            "exclusion_reason": r.management.get("exclusion_reason", ""),
            "effort": r.questionnaire,
        }


def csv_cell(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


@private.get("/studies/{study_id}/export")
def export(
    study_id: str,
    db: DB,
    format: Literal["json", "csv"] = "json",
    include_events: bool = True,
    session_id: str | None = None,
):
    lookup(db, study_id)
    rows = list(records(db, study_id, include_events, session_id))
    if format == "json":
        return rows
    out = io.StringIO()
    writer = csv.DictWriter(
        out, fieldnames=list(rows[0]) if rows else ["study_id", "participant_id", "trial_id"]
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({k: csv_cell(v) for k, v in row.items()})
    return Response(
        out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="hip-lab-trials.csv"'},
    )


def study_analysis(study: Study, db: Session) -> dict:
    from analysis.hip_analysis.model import analyze

    rows = list(records(db, study.id))
    schedule = {
        (r.id, slot["sequence"]): slot
        for r in db.scalars(select(Run).where(Run.study_id == study.id, Run.expires > now()))
        for slot in r.schedule
    }
    result = analyze(rows, study.config["widths"], study.config["distances"], schedule)
    result["quality"]["source"] = "real"
    fingerprint = hashlib.sha256()
    for row in rows:
        fingerprint.update(json.dumps(row, sort_keys=True, separators=(",", ":")).encode())
        fingerprint.update(b"\n")
    result["provenance"] = {
        "input_sha256": fingerprint.hexdigest(),
        "analysis_version": "1.0",
        "study_id": study.id,
        "protocol_version": study.config["protocol_version"],
        "computed_at": datetime.now(UTC).isoformat(),
    }
    return result


@private.get("/studies/{study_id}/analysis")
def analysis_result(study_id: str, db: DB):
    return study_analysis(lookup(db, study_id), db)


@private.get("/studies/{study_id}/report.pdf", response_class=Response)
def pdf(study_id: str, db: DB):
    from analysis.hip_analysis.report import write_report

    study = lookup(db, study_id)
    buffer = io.BytesIO()
    write_report(study_analysis(study, db), buffer, study.config)
    return Response(
        buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="hip-{study_id}.pdf"'},
    )


@private.post("/studies/{study_id}/reports", response_class=Response)
def generate_report(study_id: str, db: DB):
    response = pdf(study_id, db)
    db.execute(update(Study).where(Study.id == study_id).values(last_report_at=now()))
    db.commit()
    return response


@private.get("/reports")
def recent_reports(db: DB):
    studies = db.scalars(
        select(Study).where(Study.last_report_at.is_not(None)).order_by(Study.last_report_at.desc())
    )
    return [
        {
            "study_id": study.id,
            "title": study.config["title"],
            "generated_at": datetime.fromtimestamp(study.last_report_at, UTC).isoformat(),
        }
        for study in studies
        if study.last_report_at is not None
    ]


@private.get("/dashboard")
def dashboard(db: DB):
    protocols = studies(db)
    runs = sessions(db)
    # Select only compact measurements for the dashboard. Trajectories remain in storage.
    q = (
        select(
            Trial.record["movement_time_ms"].as_float(),
            Trial.record["first_attempt_success"].as_boolean(),
        )
        .join(Run, Run.id == Trial.session_id)
        .where(
            Run.expires > now(),
            Run.status != "withdrawn",
            Trial.record["valid"].as_boolean().is_(True),
            Trial.record["practice"].as_boolean().is_(False),
            func.coalesce(Run.management["eligibility"].as_string(), "pending") != "excluded",
        )
    )
    valid = db.execute(q).all()
    completed = sum(r["status"] == "completed" for r in runs)
    return {
        "study_counts": {
            s: sum(p["status"] == s for p in protocols) for s in ("active", "draft", "completed")
        },
        "participants": len(runs),
        "completed_sessions": completed,
        "valid_trials": len(valid),
        "average_movement_time_ms": sum(v[0] for v in valid) / len(valid) if valid else None,
        "error_rate": sum(not v[1] for v in valid) / len(valid) if valid else None,
        "completion_rate": completed / len(runs) if runs else None,
        "recent_sessions": runs[:8],
        "as_of": datetime.now(UTC).isoformat(),
        "source": "real",
    }


router.include_router(calculation_routes(admin))
router.include_router(moderated_routes(admin))
router.include_router(private)
app.include_router(router)
