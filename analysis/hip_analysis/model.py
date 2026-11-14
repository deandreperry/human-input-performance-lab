"""Participant-level estimates and conditional descriptive summaries."""

from __future__ import annotations

from collections.abc import Iterable
from itertools import product

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

from .ingest import validate


def shannon_id(distance, width):
    distances = np.asarray(distance, dtype=float)
    widths = np.asarray(width, dtype=float)
    if np.any(~np.isfinite(distances) | ~np.isfinite(widths) | (distances <= 0) | (widths <= 0)):
        raise ValueError("Width and distance must be finite and positive.")
    with np.errstate(over="ignore"):
        ratio = distances / widths
    # Splitting by ratio preserves tiny increments and avoids log2(infinity)
    # when two finite dimensions have a quotient beyond float64 range.
    with np.errstate(divide="ignore"):
        difficulty_bits = np.where(
            ratio < 1,
            np.log1p(ratio) / np.log(2.0),
            np.log2(1 + ratio),
        )
    return np.where(np.isinf(ratio), np.log2(distances) - np.log2(widths), difficulty_bits)[()]


def conditions(frame: pd.DataFrame) -> list[dict]:
    grouped = frame.groupby(["input_method", "width", "distance"], sort=True)
    rows = []
    for (method, width, distance), cell in grouped:
        mt = cell.movement_time_ms
        rows.append(
            {
                "input_method": method,
                "width": float(width),
                "distance": float(distance),
                "n_trials": len(mt),
                "n_participants": int(cell.participant_id.nunique()),
                "mean_ms": float(mt.mean()),
                "median_ms": float(mt.median()),
                "sd_ms": float(mt.std()) if len(mt) > 1 else None,
                "p10_ms": float(mt.quantile(0.10)),
                "p90_ms": float(mt.quantile(0.90)),
                "first_attempt_success_rate": float(cell.first_attempt_success.mean()),
                "first_attempt_error_rate": float(1 - cell.first_attempt_success.mean()),
                "misses": int(cell.misses.sum()),
                "nominal_bits_per_second": float(cell.difficulty.mean() / (mt.mean() / 1000)),
            }
        )
    return rows


def fits(frame: pd.DataFrame) -> list[dict]:
    output = []
    for (participant, method), block in frame.groupby(["participant_id", "input_method"]):
        record = {"participant_id": participant, "input_method": method, "n_trials": len(block)}
        if len(block) < 3 or block.difficulty.nunique() < 2:
            record["status"] = "Insufficient difficulty coverage"
        else:
            model = sm.OLS(block.movement_time_ms, sm.add_constant(block.difficulty)).fit()
            record.update(
                status="estimated",
                intercept_ms=float(model.params["const"]),
                slope_ms_per_bit=float(model.params["difficulty"]),
                r_squared=float(model.rsquared) if block.movement_time_ms.nunique() > 1 else None,
                residual_rmse_ms=float(np.sqrt(np.mean(model.resid**2))),
                residual_mean_by_id=[
                    {"difficulty_bits": float(d), "mean_residual_ms": float(r)}
                    for d, r in model.resid.groupby(block.difficulty.round(1)).mean().items()
                ],
            )
        output.append(record)
    return output


def paired_estimate(frame: pd.DataFrame, widths: Iterable[float], distances: Iterable[float]) -> dict:
    cells = set(product(widths, distances))
    if not cells:
        raise ValueError("Supply the planned width and distance levels.")
    differences = []
    excluded = []
    for participant, group in frame.groupby("participant_id"):
        # Multiple sessions can introduce additional practice and selective retesting.
        if group.session_id.nunique() != 1:
            excluded.append({"participant_id": participant, "reason": "multiple_sessions"})
            continue
        means = group.groupby(["width", "distance", "input_method"]).movement_time_ms.mean().unstack()
        means = means.reindex(columns=["trackpad", "mouse"])
        if set(means.dropna().index) != cells or set(means.index) != cells:
            excluded.append({"participant_id": participant, "reason": "incomplete_or_unplanned_cells"})
            continue
        differences.append(float((means.trackpad - means.mouse).mean()))
    n = len(differences)
    estimate = float(np.mean(differences)) if n else None
    result = {
        "method": "Equal-cell-weighted within-participant trackpad minus mouse contrast",
        "n_participants": n,
        "excluded_participants": excluded,
        "effect_ms": estimate,
        "ci95_ms": None,
        "p_two_sided": None,
        "cohen_dz": None,
        "assumptions": "Independent participants, approximately normal paired differences and complete paired cells.",
    }
    if estimate is not None and n >= 2 and np.std(differences, ddof=1) > np.finfo(float).eps:
        sd = float(np.std(differences, ddof=1))
        se = sd / np.sqrt(n)
        margin = stats.t.ppf(0.975, n - 1) * se
        result.update(
            ci95_ms=[float(estimate - margin), float(estimate + margin)],
            p_two_sided=float(2 * stats.t.sf(abs(estimate / se), n - 1)),
            cohen_dz=float(estimate / sd),
        )
    return result


def effort_summary(frame: pd.DataFrame) -> dict:
    """Deduplicate the session questionnaire repeated on exported trial records."""
    pairs: list[tuple[int, int]] = []
    if "effort" in frame.columns:
        for _, person in frame.groupby("participant_id"):
            if person.session_id.nunique() != 1:
                continue
            observed = set()
            for answer in person.effort:
                if isinstance(answer, dict):
                    mouse, trackpad = answer.get("effort_mouse"), answer.get("effort_trackpad")
                    if (
                        type(mouse) is int
                        and type(trackpad) is int
                        and 1 <= mouse <= 7
                        and 1 <= trackpad <= 7
                    ):
                        observed.add((mouse, trackpad))
            if len(observed) == 1:
                pairs.append(observed.pop())
    return {
        "n_participants": len(pairs),
        "median_mouse": float(np.median([p[0] for p in pairs])) if pairs else None,
        "median_trackpad": float(np.median([p[1] for p in pairs])) if pairs else None,
        "trackpad_rated_higher": sum(b > a for a, b in pairs),
        "trackpad_rated_lower": sum(b < a for a, b in pairs),
        "equal_ratings": sum(a == b for a, b in pairs),
    }


def analyze(rows: list[dict], widths=(24, 40, 64), distances=(150, 300, 450), schedule=None) -> dict:
    strata = {(r.get("study_id"), r.get("protocol_version")) for r in rows if isinstance(r, dict)}
    if len(strata) > 1:
        raise ValueError("Select one study and protocol version per analysis.")
    frame, quality = validate(rows, schedule)
    report: dict = {
        "quality": quality,
        "conditions": [],
        "fits": [],
        "paired": None,
        "effort": effort_summary(frame),
    }
    if not frame.empty:
        frame["difficulty"] = shannon_id(frame.actual_distance, frame.target_width)
        report.update(
            conditions=conditions(frame),
            fits=fits(frame),
            paired=paired_estimate(frame, widths, distances),
        )
    return report
