"""Generate a separate, reproducible demonstration export without touching a database."""

from __future__ import annotations

import numpy as np


def synthetic_trials(participants: int = 12, seed: int = 713) -> list[dict]:
    if participants < 1:
        raise ValueError("Use at least one participant.")
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(participants):
        pid = f"DEMO-P{i + 1:03}"
        methods = ["mouse", "trackpad"] if i % 2 == 0 else ["trackpad", "mouse"]
        baseline, extra = rng.normal(240, 20), rng.normal(65, 22)
        effort = {"effort_mouse": 2 + i % 3, "effort_trackpad": 3 + (i + 1) % 3}
        sequence = 0
        for method in methods:
            cells = [(w, d) for w in (24, 40, 64) for d in (150, 300, 450)]
            rng.shuffle(cells)
            for width, distance in cells:
                sequence += 1
                start = sequence * 3000.0
                mt = round(
                    float(
                        baseline
                        + 86 * np.log2(1 + distance / width)
                        + extra * (method == "trackpad")
                        + rng.normal(0, 22)
                    ),
                    3,
                )
                miss = rng.random() < (0.08 if width == 24 else 0.025)
                acquisition = mt + (140 if miss else 0)
                x0, y0 = 80.0, 220.0
                x1, y1 = x0 + distance, y0
                end_x = x1 + float(rng.uniform(-width / 4, width / 4))
                events = [
                    {"type": "down", "t": start, "x": x0, "y": y0},
                    {"type": "up", "t": start + 25, "x": x0, "y": y0},
                ]
                for t in np.linspace(0.1, 0.9, 9):
                    events.append(
                        {
                            "type": "move",
                            "t": start + float(t) * mt,
                            "x": x0 + float(t) * distance,
                            "y": y0 + float(rng.normal(0, 2)),
                        }
                    )
                if miss:
                    events.extend(
                        [
                            {"type": "down", "t": start + mt, "x": x1 + width, "y": y1},
                            {"type": "up", "t": start + mt + 35, "x": x1 + width, "y": y1},
                        ]
                    )
                end = start + acquisition + 40
                events.extend(
                    [
                        {"type": "down", "t": start + acquisition, "x": end_x, "y": y1},
                        {"type": "up", "t": end, "x": end_x, "y": y1},
                    ]
                )
                rows.append(
                    {
                        "source": "synthetic",
                        "study_id": "DEMO-POINTING",
                        "protocol_version": "1.0",
                        "participant_id": pid,
                        "session_id": f"DEMO-S{i + 1:03}",
                        "trial_id": f"{pid}-{sequence}",
                        "condition_id": f"{method}-{width}-{distance}",
                        "sequence": sequence,
                        "input_method": method,
                        "order": "-".join(methods),
                        "width": width,
                        "distance": distance,
                        "actual_distance": distance,
                        "target_width": width,
                        "start_x": x0,
                        "start_y": y0,
                        "target_x": x1,
                        "target_y": y1,
                        "started_at_ms": start,
                        "ended_at_ms": end,
                        "movement_time_ms": mt,
                        "acquisition_time_ms": acquisition,
                        "total_time_ms": end - start,
                        "events": events,
                        "first_attempt_success": not miss,
                        "misses": int(miss),
                        "retry_count": int(miss),
                        "outcome": "completed",
                        "valid": True,
                        "practice": False,
                        "effort": effort.copy(),
                    }
                )
    return rows
