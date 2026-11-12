"""Validate an immutable export; every rejected row retains its exclusion reasons."""

from __future__ import annotations

import itertools
from collections import Counter
from math import hypot, isclose, isfinite
from typing import Any, TypeGuard

import pandas as pd

IDS = ("study_id", "participant_id", "session_id", "trial_id", "condition_id", "protocol_version")
METHODS = {"mouse", "trackpad"}


def number(value: Any, positive: bool = False) -> TypeGuard[int | float]:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and isfinite(value)
        and (not positive or value > 0)
    )


def _event_reasons(row: dict) -> list[str]:
    events = row.get("events")
    if not isinstance(events, list) or any(
        not isinstance(e, dict)
        or e.get("type") not in ("down", "up", "move")
        or not all(number(e.get(k)) for k in ("t", "x", "y"))
        for e in events
    ):
        return ["invalid_events"]
    times = [e["t"] for e in events]
    if any(a > b for a, b in itertools.pairwise(times)):
        return ["unordered_events"]
    if row.get("outcome") != "completed":
        return []
    start, end = row.get("started_at_ms"), row.get("ended_at_ms")
    if not (number(start) and number(end) and end > start):
        return ["invalid_timestamps"]
    if not times or times[0] < start - 0.1 or times[-1] > end + 0.1:
        return ["event_outside_trial"]
    if not all(number(row.get(k), positive=True) for k in ("total_time_ms", "movement_time_ms")):
        return ["invalid_duration"]
    if row["movement_time_ms"] > row["total_time_ms"] or not isclose(
        row["total_time_ms"], end - start, abs_tol=1.0
    ):
        return ["duration_mismatch"]
    downs = [event for event in events[1:] if event["type"] == "down"]
    if (
        events[0]["type"] != "down"
        or not downs
        or events[-1]["type"] != "up"
        or not isclose(times[0], start, abs_tol=0.1)
        or not isclose(times[-1], end, abs_tol=0.1)
    ):
        return ["incomplete_event_sequence"]
    if not isclose(downs[0]["t"] - start, row["movement_time_ms"], abs_tol=1.0):
        return ["first_attempt_time_mismatch"]
    if all(number(row.get(k)) for k in ("target_x", "target_y", "target_width")):
        hits = [
            hypot(down["x"] - row["target_x"], down["y"] - row["target_y"]) <= row["target_width"] / 2
            for down in downs
        ]
        if not hits[-1] or any(hits[:-1]) or row.get("misses") != len(downs) - 1:
            return ["endpoint_scoring_mismatch"]
    return []


def validate(rows: list[dict], schedule: dict | None = None) -> tuple[pd.DataFrame, dict]:
    """Optional schedule maps (session_id, sequence) to expected assignment dict."""
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise ValueError("Expected a JSON array of trial objects.")
    origins = {r.get("source") for r in rows}
    if len(origins) > 1 or origins - {"synthetic", "real"}:
        raise ValueError("Each export must explicitly contain a single real or synthetic source.")
    keys = [str(r.get("trial_id")) for r in rows]
    duplicates = {key for key, n in Counter(keys).items() if n > 1}
    flags: Counter[str] = Counter()
    audited = []
    frame = []
    for index, row in enumerate(rows):
        reasons = []
        if any(not isinstance(row.get(k), str) or not row[k].strip() for k in IDS):
            reasons.append("missing_identifier")
        if keys[index] in duplicates:
            reasons.append("duplicate_trial")
        if row.get("input_method") not in METHODS or row.get("order") not in (
            "mouse-trackpad",
            "trackpad-mouse",
        ):
            reasons.append("invalid_condition")
        if any(
            f"assigned_{k}" in row and row[f"assigned_{k}"] != row.get(k)
            for k in ("input_method", "width", "distance")
        ):
            reasons.append("assignment_mismatch")
        if schedule is not None:
            expected = schedule.get((row.get("session_id"), row.get("sequence")))
            if expected is None or any(row.get(k) != v for k, v in expected.items()):
                reasons.append("assignment_mismatch")
        if row.get("session_status") == "withdrawn":
            reasons.append("session_withdrawn")
        if row.get("eligibility") == "excluded":
            reasons.append("researcher_excluded")
        if row.get("practice") is not False:
            reasons.append("practice" if row.get("practice") is True else "missing_practice_flag")
        if row.get("outcome") != "completed" or row.get("valid") is not True:
            reasons.append("incomplete_or_invalid")
        metrics = ("width", "distance", "actual_distance", "target_width")
        if not all(number(row.get(k), positive=True) for k in metrics):
            reasons.append("invalid_geometry")
        if not all(number(row.get(k)) for k in ("start_x", "start_y", "target_x", "target_y")):
            reasons.append("missing_coordinates")
        elif number(row.get("actual_distance")) and not isclose(
            hypot(row["start_x"] - row["target_x"], row["start_y"] - row["target_y"]),
            row["actual_distance"],
            abs_tol=0.75,
        ):
            reasons.append("distance_mismatch")
        if row.get("outcome") == "completed":
            misses = row.get("misses")
            if (
                type(misses) is not int
                or misses < 0
                or row.get("first_attempt_success") is not (misses == 0)
            ):
                reasons.append("invalid_accuracy")
        reasons.extend(_event_reasons(row))
        if reasons:
            flags.update(reasons)
            audited.append({"row": index, "trial_id": row.get("trial_id"), "reasons": reasons})
        else:
            frame.append(row.copy())
    measured = [r for r in rows if r.get("practice") is False]
    return pd.DataFrame(frame), {
        "source": next(iter(origins), None),
        "raw_rows": len(rows),
        "eligible_rows": len(frame),
        "excluded_rows": len(audited),
        "measured_rows": len(measured),
        "observed_completion_rate": sum(r.get("outcome") == "completed" for r in measured)
        / len(measured)
        if measured
        else None,
        "distinct_participants_observed": len(
            {r["participant_id"] for r in rows if r.get("participant_id")}
        ),
        "reasons": dict(flags),
        "excluded": audited,
    }
