"""Storage models. Schema creation and upgrades belong to Alembic."""

import os
import time
from collections.abc import Iterator
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import JSON, ForeignKey, Integer, String, UniqueConstraint, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

load_dotenv()
DATABASE_URL = os.getenv("HIP_DATABASE_URL", "sqlite:///./backend/lab.sqlite3")
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
if engine.dialect.name == "sqlite":

    @event.listens_for(engine, "connect")
    def sqlite_setup(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")


def uid() -> str:
    return uuid4().hex


def now() -> int:
    return int(time.time())


class Base(DeclarativeBase):
    pass


class Study(Base):
    __tablename__ = "studies"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    config: Mapped[dict] = mapped_column(JSON)
    last_report_at: Mapped[int | None] = mapped_column(nullable=True)
    assignments: Mapped[int] = mapped_column(default=0)
    created: Mapped[int] = mapped_column(default=now)


class Run(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    participant_id: Mapped[str] = mapped_column(String(32), unique=True)
    study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    secret_hash: Mapped[str] = mapped_column(String(64))
    consent_at: Mapped[int]
    expires: Mapped[int] = mapped_column(index=True)
    protocol: Mapped[dict] = mapped_column(JSON)
    schedule: Mapped[list] = mapped_column(JSON)
    seed: Mapped[str] = mapped_column(String(32))
    info: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="in_progress")
    next_sequence: Mapped[int] = mapped_column(Integer, default=1)
    questionnaire: Mapped[dict] = mapped_column(JSON, default=dict)
    management: Mapped[dict] = mapped_column(JSON, default=dict)


class Trial(Base):
    __tablename__ = "trials"
    __table_args__ = (UniqueConstraint("session_id", "sequence"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int]
    digest: Mapped[str] = mapped_column(String(64))
    record: Mapped[dict] = mapped_column(JSON)


class Login(Base):
    __tablename__ = "researcher_logins"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires: Mapped[int]


def database() -> Iterator[Session]:
    with Session(engine) as db:
        yield db


class UsabilityStudy(Base):
    __tablename__ = "usability_studies"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    protocol: Mapped[dict] = mapped_column(JSON)
    created: Mapped[int] = mapped_column(default=now)


class UsabilitySession(Base):
    __tablename__ = "usability_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    study_id: Mapped[str] = mapped_column(ForeignKey("usability_studies.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64))
    consent_at: Mapped[int]
    expires: Mapped[int] = mapped_column(index=True)
    revision: Mapped[int] = mapped_column(default=0)
    phase: Mapped[str] = mapped_column(String(16), default="ready")
    position: Mapped[int] = mapped_column(default=0)
    timeline: Mapped[list] = mapped_column(JSON, default=list)


class SavedCalculation(Base):
    __tablename__ = "saved_calculations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    pointing_id: Mapped[str | None] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    moderated_id: Mapped[str | None] = mapped_column(
        ForeignKey("usability_studies.id", ondelete="CASCADE"), index=True
    )
    payload: Mapped[dict] = mapped_column(JSON)
    created: Mapped[int] = mapped_column(default=now)
