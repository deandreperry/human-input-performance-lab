"""Moderated task counts are rebuilt from eligible sessions for every report."""

from collections import defaultdict


def summarize(tasks, sessions):
    rows = [
        {
            "prompt": prompt,
            "started": 0,
            "independent": 0,
            "assisted": 0,
            "abandoned": 0,
            "unscored": 0,
            "notes": [],
        }
        for prompt in tasks
    ]
    for run in sessions:
        groups = defaultdict(list)
        for event in run.timeline:
            groups[event["position"]].append(event)
        for index, events in groups.items():
            # Withdrawal may be recorded after the final task.
            if index >= len(tasks):
                continue
            row = rows[index]
            outcome = next((e["text"] for e in events if e["kind"] == "outcome"), "unscored")
            if any(e["kind"] == "start" for e in events):
                row["started"] += 1
                row[outcome] += 1
            for event in events:
                if event["kind"] == "note":
                    row["notes"].append({"outcome": outcome, "text": event["text"], "at": event["at"]})
    return rows
