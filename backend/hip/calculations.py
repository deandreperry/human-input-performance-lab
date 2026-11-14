"""Private manual worksheets; observed session aggregates are always recomputed separately."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import SavedCalculation, Study, UsabilityStudy, database, now
from .schema import Model

DB = Annotated[Session, Depends(database)]
BoundedText = Annotated[str, Field(max_length=20000)]
Name = Annotated[str, Field(min_length=1, max_length=120)]
Kind = Literal["pointing", "moderated"]


class Inputs(Model):
    first: BoundedText
    second: BoundedText
    third: BoundedText


class Worksheet(Model):
    title: Name
    method: Literal[
        "success", "completion", "conversion", "time", "stats", "errors", "ratings", "sus", "planning"
    ]
    label: Name
    primary: Inputs
    other_label: Name
    other: Inputs | None = None


def routes(admin):
    router = APIRouter(prefix="/calculations", dependencies=[Depends(admin)], tags=["research metrics"])

    def scoped(db, kind, study_id):
        model, column = (
            (Study, SavedCalculation.pointing_id)
            if kind == "pointing"
            else (UsabilityStudy, SavedCalculation.moderated_id)
        )
        if not db.get(model, study_id):
            raise HTTPException(404, "Study not found.")
        return select(SavedCalculation).where(column == study_id)

    @router.get("/{kind}/{study_id}")
    def saved(kind: Kind, study_id: str, db: DB):
        query = scoped(db, kind, study_id).order_by(SavedCalculation.created.desc(), SavedCalculation.id)
        return [{"id": row.id, "created": row.created, **row.payload} for row in db.scalars(query)]

    @router.post("/{kind}/{study_id}", status_code=201)
    def save(kind: Kind, study_id: str, payload: Worksheet, db: DB):
        scoped(db, kind, study_id)
        row = SavedCalculation(
            pointing_id=study_id if kind == "pointing" else None,
            moderated_id=study_id if kind == "moderated" else None,
            payload=payload.model_dump(),
            created=now(),
        )
        db.add(row)
        db.commit()
        return {"id": row.id}

    @router.delete("/{kind}/{study_id}/{key}", status_code=204)
    def remove(kind: Kind, study_id: str, key: str, db: DB):
        row = db.scalar(scoped(db, kind, study_id).where(SavedCalculation.id == key))
        if not row:
            raise HTTPException(404, "Calculation not found.")
        db.delete(row)
        db.commit()
        return Response(status_code=204)

    return router
