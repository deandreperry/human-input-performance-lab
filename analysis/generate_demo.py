"""Regenerate the versioned browser fixture from the same scored trials as the Python analyses."""

import argparse
import gzip
import json
from datetime import UTC, datetime, timedelta
from itertools import groupby
from pathlib import Path

from hip_analysis import analyze, synthetic_trials

DESTINATION = Path(__file__).resolve().parents[1] / "frontend/lib/demo-data.json"
FIXTURE_END = datetime(2026, 11, 12, 20, 0, tzinfo=UTC)
STUDIES = [("pointing", 24, 713), ("distance", 12, 714)]
VERSION = 1


def dataset() -> tuple[list[dict], dict[str, list[dict]]]:
    sessions: list[dict] = []
    raw: dict[str, list[dict]] = {"pointing": [], "distance": [], "precision": []}
    for study, size, seed in STUDIES:
        original = synthetic_trials(participants=size, seed=seed)
        for index, (_, block) in enumerate(groupby(original, key=lambda r: r["participant_id"])):
            serial = len(sessions)
            pid, sid = f"P-{serial + 1:03}", f"S-{serial + 1:03}"
            status = "completed"
            if study == "pointing":
                if index in (4, 11):
                    status = "withdrawn"
                elif index in (1, 5, 18):
                    status = "in_progress"
            trials = list(block)
            order = trials[0]["order"].split("-")
            if status == "withdrawn":
                trials = []
            elif status == "in_progress":
                trials = trials[: 5 + index % 8]
            for t in trials:
                t.update(
                    session_id=sid,
                    participant_id=pid,
                    study_id=study,
                    session_status=status,
                    eligibility="eligible",
                    trial_id=f"{sid}-{t['sequence']}",
                )
                if status != "completed":
                    t["effort"] = {}
                if serial % 7 == 0 and t["sequence"] == 5:
                    # Lose focus after the first miss; retain the incomplete trace and elapsed time.
                    down = next(e for e in t["events"][1:] if e["type"] == "down")
                    down["x"] = t["target_x"] + t["width"]
                    t["events"] = [e for e in t["events"] if e["t"] <= down["t"]]
                    t.update(
                        valid=False,
                        outcome="interrupted",
                        ended_at_ms=down["t"],
                        acquisition_time_ms=None,
                        total_time_ms=t["movement_time_ms"],
                        interruption_reason="Window lost focus",
                        first_attempt_success=False,
                        misses=1,
                        retry_count=0,
                    )
            raw[study].extend(trials)
            start = FIXTURE_END - timedelta(minutes=round(serial * 27 * 24 * 60 / 35))
            sessions.append(
                {
                    "id": sid,
                    "participant_id": pid,
                    "study_id": study,
                    "status": status,
                    "started_at": start.isoformat().replace("+00:00", "Z"),
                    "order": order,
                    "eligibility": "eligible",
                    "notes": "",
                    "verified_methods": [],
                    "trial_count": len(trials),
                }
            )
    return sessions, raw


def fixture(sessions: list[dict], raw: dict[str, list[dict]]) -> dict:
    analyses = {}
    trials = []
    for study, rows in raw.items():
        result = analyze(rows)
        result["quality"]["source"] = "synthetic"
        analyses[study] = result
        for row in rows:
            trial = {
                k: row[k]
                for k in (
                    "session_id",
                    "participant_id",
                    "input_method",
                    "target_width",
                    "movement_time_ms",
                    "acquisition_time_ms",
                    "first_attempt_success",
                    "valid",
                    "practice",
                )
            }
            trial["target_distance"] = row["distance"]
            if row["sequence"] == 1:
                trial["trajectory"] = [
                    {"x": round(e["x"], 3), "y": round(e["y"], 3)} for e in row["events"]
                ]
            trials.append(trial)
    return {
        "version": VERSION,
        "source": "synthetic",
        "sessions": sessions,
        "trials": trials,
        "analyses": analyses,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--study", choices=("pointing", "distance", "precision"), default="pointing")
    parser.add_argument(
        "--raw", type=Path, help="Write the specified study's private-format synthetic export"
    )
    args = parser.parse_args()
    sessions, raw = dataset()
    if args.raw:
        args.raw.write_text(json.dumps(raw[args.study], separators=(",", ":"), allow_nan=False) + "\n")
        return
    rendered = json.dumps(fixture(sessions, raw), separators=(",", ":"), allow_nan=False) + "\n"
    export_dir = DESTINATION.parents[1] / "data"
    export_dir.mkdir(exist_ok=True)
    for study, study_rows in raw.items():
        destination = export_dir / f"{study}.json.gz"
        content = json.dumps(study_rows, separators=(",", ":")).encode()
        if args.check:
            if gzip.decompress(destination.read_bytes()) != content:
                raise SystemExit(f"Demo export differs for {study}.")
        else:
            destination.write_bytes(gzip.compress(content, mtime=0))
    if args.check:
        if rendered != DESTINATION.read_text():
            raise SystemExit("Demo data differs from the generated fixture.")
    else:
        DESTINATION.write_text(rendered)


if __name__ == "__main__":
    main()
