"""Render private, provenance-labelled research figures from validated rows."""

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from .ingest import validate
from .model import shannon_id


def figures(rows: list[dict]):
    frame, quality = validate(rows)
    if frame.empty:
        raise ValueError("No eligible trials for plotting.")
    frame["difficulty"] = shannon_id(frame.actual_distance, frame.target_width)
    title = f"{quality['source'].upper()} · {frame.participant_id.nunique()} participants · {len(frame)} trials"
    methods = list(frame.input_method.unique())
    palette = {"mouse": "#326778", "trackpad": "#9c581e"}
    fig, axes = plt.subplots(2, 3, figsize=(14, 8), layout="constrained")
    hist, box, errors, regression, people, trace = axes.flat
    bins = np.histogram_bin_edges(frame.movement_time_ms, bins="auto")
    for i, method in enumerate(methods, 1):
        group = frame[frame.input_method == method]
        color = palette[method]
        hist.hist(group.movement_time_ms, bins=bins, histtype="step", color=color, label=method)
        box.boxplot(group.movement_time_ms, positions=[i], widths=0.5, boxprops={"color": color})
        sizes = (1 - group.groupby("width").first_attempt_success.mean()).sort_index()
        errors.plot(sizes.index, sizes.values * 100, "o-", color=color, label=method)
        regression.scatter(group.difficulty, group.movement_time_ms, s=9, alpha=0.3, color=color)
        for _, b in group.groupby("participant_id"):
            if b.difficulty.nunique() >= 2:
                slope, intercept = np.polyfit(b.difficulty, b.movement_time_ms, 1)
                x = np.array([b.difficulty.min(), b.difficulty.max()])
                regression.plot(x, intercept + slope * x, color=color, alpha=0.3, linewidth=0.8)
    hist.set(xlabel="First-attempt latency (ms)", ylabel="Trials", title="Timing distribution")
    hist.legend()
    box.set(
        xticks=range(1, len(methods) + 1),
        xticklabels=methods,
        ylabel="Latency (ms)",
        title="By input method",
    )
    errors.set(
        xlabel="Target width (CSS px)", ylabel="First-attempt error (%)", ylim=(0, 100), title="Accuracy"
    )
    errors.legend()
    regression.set(
        xlabel="Shannon difficulty (bits)", ylabel="Latency (ms)", title="Participant regressions"
    )
    for _, p in frame.groupby("participant_id"):
        means = p.groupby("input_method").movement_time_ms.mean().reindex(methods)
        people.plot(
            range(len(methods)), means, "o-", linewidth=0.7, markersize=3, color="#426a79", alpha=0.6
        )
    people.set(
        xticks=range(len(methods)),
        xticklabels=methods,
        ylabel="Mean latency (ms)",
        title="Paired participants",
    )
    trial = frame.iloc[0]
    events = trial.events
    trace.plot([e["x"] for e in events], [e["y"] for e in events], color="#326778", linewidth=1.5)
    trace.add_patch(
        plt.Circle((trial.target_x, trial.target_y), trial.target_width / 2, fill=False, color="#9c581e")
    )
    trace.invert_yaxis()
    trace.set_aspect("equal", adjustable="datalim")
    trace.set(xlabel="Arena x (CSS px)", ylabel="Arena y (CSS px)", title="First eligible trajectory")
    fig.suptitle(title)
    return fig


def export_figures(rows: list[dict], directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    fig = figures(rows)
    try:
        for ext in ("png", "svg"):
            fig.savefig(directory / f"private-research-figures.{ext}", dpi=150)
    finally:
        plt.close(fig)
