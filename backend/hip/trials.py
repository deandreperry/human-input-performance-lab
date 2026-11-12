"""Seeded factorial blocks and server-side scoring of immutable pointer events."""

import math
import random
from itertools import pairwise, product

from .schema import Attempt, Protocol


def make_schedule(protocol: Protocol, assignment: int, seed: str) -> list[dict]:
    rng = random.Random(seed)
    cells = list(product(protocol.widths, protocol.distances))
    order = ["mouse", "trackpad"] if assignment % 2 else ["trackpad", "mouse"]
    schedule = []
    for method in order:
        for width, distance in rng.choices(cells, k=protocol.practice_trials):
            schedule.append(
                {"input_method": method, "width": width, "distance": distance, "practice": True}
            )
        for _ in range(protocol.repetitions):
            block = cells.copy()
            rng.shuffle(block)
            for width, distance in block:
                schedule.append(
                    {"input_method": method, "width": width, "distance": distance, "practice": False}
                )
    return [dict(sequence=i, **trial) for i, trial in enumerate(schedule, start=1)]


def score(attempt: Attempt, plan: dict, metadata: dict) -> dict:
    events = attempt.events
    if (
        metadata.get("confirmed_method") != plan["input_method"]
        or attempt.input_method != plan["input_method"]
    ):
        raise ValueError("Confirm the assigned input method before recording this trial.")
    distance = math.hypot(attempt.target_x - attempt.start_x, attempt.target_y - attempt.start_y)
    if abs(attempt.target_width - plan["width"]) > 1 or abs(distance - plan["distance"]) > 1:
        raise ValueError("Target geometry deviates from the assigned condition.")
    start = events[0]
    if (start.type, start.t, start.x, start.y) != (
        "down",
        attempt.started_at_ms,
        attempt.start_x,
        attempt.start_y,
    ):
        raise ValueError("First event must be the start activation.")
    if any(a.t > b.t for a, b in pairwise(events)) or events[-1].t > attempt.ended_at_ms:
        raise ValueError("Pointer events must be ordered within the trial interval.")
    if any(v is not None for v in (attempt.start_center_x, attempt.start_center_y, attempt.start_width)):
        if (
            attempt.start_center_x is None
            or attempt.start_center_y is None
            or attempt.start_width is None
        ):
            raise ValueError("Provide both start center coordinates and its diameter.")
        offset = math.hypot(start.x - attempt.start_center_x, start.y - attempt.start_center_y)
        if offset > attempt.start_width / 2:
            raise ValueError("Start activation falls outside the recorded start target.")
    if attempt.outcome == "completed":
        expected = "down"
        for event in events:
            if event.type != "move":
                if event.type != expected:
                    raise ValueError("Primary-button downs and releases must alternate.")
                expected = "up" if expected == "down" else "down"
    attempts = [e for e in events[1:] if e.type == "down"]
    hits = [
        e
        for e in attempts
        if math.hypot(e.x - attempt.target_x, e.y - attempt.target_y) <= attempt.target_width / 2
    ]
    complete = attempt.outcome == "completed"
    if complete and (
        not hits
        or attempts[0].t <= start.t
        or len(hits) > 1
        or hits[0] is not attempts[-1]
        or events[-1].type != "up"
        or events[-1].t != attempt.ended_at_ms
    ):
        raise ValueError("Completed trials require a destination hit followed by release.")
    if not complete and not attempt.interruption_reason:
        raise ValueError("Document the reason for interruption.")
    misses = len(attempts) - len(hits)
    return {
        **plan,
        **attempt.model_dump(),
        "metadata": metadata,
        "scoring_version": "1.0",
        "actual_distance": distance,
        "target_distance": plan["distance"],
        "valid": complete,
        "movement_time_ms": attempts[0].t - start.t if attempts else None,
        "acquisition_time_ms": hits[0].t - start.t if hits else None,
        "total_time_ms": attempt.ended_at_ms - start.t,
        "first_attempt_success": (bool(hits and hits[0] is attempts[0]) if attempts else None),
        "misses": misses,
        "retry_count": max(0, len(attempts) - 1),
        "assigned_width": plan["width"],
        "assigned_distance": plan["distance"],
        "assigned_input_method": plan["input_method"],
        "condition_id": f"{plan['input_method']}-{plan['width']}-{plan['distance']}",
    }
