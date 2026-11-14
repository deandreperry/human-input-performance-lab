"""Moderated sessions. Only explicit participant actions and observer entries are collected."""

import hashlib
import secrets
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import Field, HttpUrl, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import UsabilitySession, UsabilityStudy, database, now
from .schema import Model
from .study_results import summarize

DB = Annotated[Session, Depends(database)]
Text = Annotated[str, Field(min_length=1, max_length=2000)]
Outcome = Literal["independent", "assisted", "abandoned"]
Phase = Literal["ready", "working", "review", "completed", "withdrawn"]


class Protocol(Model):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    objective: Text
    tasks: Annotated[list[Text], Field(min_length=1, max_length=30)]
    prototype_url: HttpUrl | None = None
    retention_days: int = Field(default=90, ge=1, le=730)

    @field_validator("prototype_url")
    @classmethod
    def public_link(cls, url):
        if url and (url.username or url.password):
            raise ValueError("Use a prototype URL without embedded credentials.")
        return url


class StudyView(Protocol):
    id: str


class Enrollment(Model):
    consent: Literal[True]
    receipt: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class Progress(Model):
    id: str
    study_id: str
    position: int
    phase: Phase
    revision: int
    consent_at: int


class Entry(Model):
    at: datetime
    position: int
    kind: Literal["start", "review", "withdraw", "note", "outcome"]
    text: str = ""


class ObserverView(Progress):
    timeline: list[Entry]


class Action(Model):
    revision: int = Field(ge=0)
    action: Literal["start", "review", "withdraw"]


class Rating(Model):
    revision: int = Field(ge=0)
    outcome: Outcome


class Note(Model):
    revision: int = Field(ge=0)
    text: Text


def study(db: Session, study_id: str) -> UsabilityStudy:
    item = db.get(UsabilityStudy, study_id)
    if item is None:
        raise HTTPException(404, "Study not found.")
    return item


def session(db: Session, sid: str) -> UsabilitySession:
    item = db.get(UsabilitySession, sid)
    if item is None or item.expires <= now():
        raise HTTPException(404, "Session has ended or been deleted.")
    return item


def member(sid: str, db: DB, authorization: Annotated[str | None, Header()] = None):
    item = session(db, sid)
    if (
        not authorization
        or not authorization.startswith("Bearer ")
        or not secrets.compare_digest(
            hashlib.sha256(authorization[7:].encode()).hexdigest(), item.token_hash
        )
    ):
        raise HTTPException(401, "A participant receipt is required.")
    return item


Member = Annotated[UsabilitySession, Depends(member)]


def record(db, item, revision, kind, text="", **changes):
    event = {"at": datetime.now(UTC).isoformat(), "position": item.position, "kind": kind, "text": text}
    updated = db.execute(
        update(UsabilitySession)
        .where(
            UsabilitySession.id == item.id,
            UsabilitySession.revision == revision,
            UsabilitySession.expires > now(),
        )
        .values(revision=revision + 1, timeline=[*item.timeline, event], **changes)
    )
    if updated.rowcount != 1:
        raise HTTPException(409, "Session changed. Review current progress and retry.")
    db.commit()
    return item


def routers(admin):
    public = APIRouter(prefix="/moderated", tags=["moderated usability"])
    private = APIRouter(dependencies=[Depends(admin)])

    @private.post("/studies", response_model=StudyView, status_code=201)
    def create(payload: Protocol, db: DB):
        item = UsabilityStudy(protocol=payload.model_dump(mode="json"))
        db.add(item)
        db.commit()
        return {"id": item.id, **item.protocol}

    @private.get("/studies", response_model=list[StudyView])
    def studies(db: DB):
        return [
            {"id": s.id, **s.protocol}
            for s in db.scalars(select(UsabilityStudy).order_by(UsabilityStudy.created.desc()))
        ]

    @public.get("/studies/{study_id}", response_model=StudyView)
    def overview(study_id: str, db: DB):
        item = study(db, study_id)
        return {"id": item.id, **item.protocol}

    @public.post("/studies/{study_id}/enroll", response_model=Progress)
    def enroll(study_id: str, payload: Enrollment, db: DB):
        protocol = study(db, study_id).protocol
        sid = hashlib.sha256((study_id + payload.receipt).encode()).hexdigest()[:32]
        item = db.get(UsabilitySession, sid)
        if item is None:
            item = UsabilitySession(
                id=sid,
                study_id=study_id,
                token_hash=hashlib.sha256(payload.receipt.encode()).hexdigest(),
                consent_at=now(),
                expires=now() + 86400 * protocol["retention_days"],
            )
            db.add(item)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
        return session(db, sid)

    @private.get("/studies/{study_id}/sessions", response_model=list[Progress])
    def sessions(study_id: str, db: DB):
        study(db, study_id)
        return list(
            db.scalars(
                select(UsabilitySession)
                .where(UsabilitySession.study_id == study_id, UsabilitySession.expires > now())
                .order_by(UsabilitySession.consent_at.desc())
            )
        )

    @private.get("/studies/{study_id}/results")
    def results(study_id: str, db: DB):
        protocol = study(db, study_id).protocol
        runs = list(
            db.scalars(
                select(UsabilitySession).where(
                    UsabilitySession.study_id == study_id,
                    UsabilitySession.expires > now(),
                    UsabilitySession.phase != "withdrawn",
                )
            )
        )
        return {"sessions": len(runs), "tasks": summarize(protocol["tasks"], runs)}

    @public.get("/participant/{sid}", response_model=Progress)
    def progress(item: Member):
        return item

    @public.post("/participant/{sid}", response_model=Progress)
    def advance(payload: Action, item: Member, db: DB):
        if payload.action == "withdraw" and item.phase != "withdrawn":
            return record(db, item, payload.revision, "withdraw", phase="withdrawn")
        if (item.phase, payload.action) not in {("ready", "start"), ("working", "review")}:
            raise HTTPException(409, "That action is unavailable for the current task.")
        return record(
            db,
            item,
            payload.revision,
            payload.action,
            phase="working" if payload.action == "start" else "review",
        )

    @public.delete("/participant/{sid}", status_code=204)
    def erase(item: Member, db: DB):
        db.delete(item)
        db.commit()
        return Response(status_code=204)

    @private.get("/sessions/{sid}", response_model=ObserverView)
    def inspect(sid: str, db: DB):
        return session(db, sid)

    @private.post("/sessions/{sid}/notes", response_model=ObserverView)
    def annotate(sid: str, payload: Note, db: DB):
        item = session(db, sid)
        if item.phase in {"completed", "withdrawn"}:
            raise HTTPException(409, "The session is closed.")
        return record(db, item, payload.revision, "note", payload.text)

    @private.post("/sessions/{sid}/outcomes", response_model=ObserverView)
    def rate(sid: str, payload: Rating, db: DB):
        item = session(db, sid)
        if item.phase not in {"working", "review"}:
            raise HTTPException(409, "The participant must start this task first.")
        position = item.position + 1
        phase = "completed" if position == len(study(db, item.study_id).protocol["tasks"]) else "ready"
        return record(
            db, item, payload.revision, "outcome", payload.outcome, position=position, phase=phase
        )

    @private.delete("/sessions/{sid}", status_code=204)
    def admin_delete(sid: str, db: DB):
        return erase(session(db, sid), db)

    public.include_router(private)
    return public
