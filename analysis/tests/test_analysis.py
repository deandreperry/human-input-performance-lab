import json
from copy import deepcopy

import numpy as np
import pytest
from hip_analysis import analyze, shannon_id, synthetic_trials
from hip_analysis.ingest import validate


def test_difficulty_and_invalid_dimensions():
    assert shannon_id(120, 40) == 2
    for value in (0, -1, np.nan, np.inf):
        with pytest.raises(ValueError):
            shannon_id(value, 30)


def test_reproducible_and_raw_records_immutable():
    source = synthetic_trials(4)
    before = deepcopy(source)
    report = analyze(source)
    assert source == before == synthetic_trials(4)
    assert report["quality"]["eligible_rows"] == 72
    assert report["paired"]["n_participants"] == 4
    assert len(report["fits"]) == 8
    assert report["paired"]["effect_ms"] > 0
    assert report["paired"]["ci95_ms"][0] <= report["paired"]["effect_ms"]
    json.dumps(report, allow_nan=False)


def test_duplicate_excludes_both_copies_and_reports_incomplete_pair():
    rows = synthetic_trials(2)
    rows.append(deepcopy(rows[0]))
    report = analyze(rows)
    assert report["quality"]["reasons"]["duplicate_trial"] == 2
    assert report["paired"]["n_participants"] == 1
    assert report["paired"]["p_two_sided"] is None


def test_exclusions_are_auditable():
    rows = synthetic_trials(1)
    rows[0]["events"].reverse()
    rows[1]["actual_distance"] += 30
    rows[2]["practice"] = True
    rows[3]["outcome"] = "interrupted"
    rows[4]["assigned_input_method"] = "stylus"
    _, q = validate(rows)
    assert q["reasons"] == {
        "unordered_events": 1,
        "distance_mismatch": 1,
        "practice": 1,
        "incomplete_or_invalid": 1,
        "assignment_mismatch": 1,
    }
    assert q["excluded_rows"] == 5


def test_mixed_sources_and_protocols_rejected():
    rows = synthetic_trials(1)
    rows[0]["source"] = "real"
    with pytest.raises(ValueError, match="source"):
        analyze(rows)
    rows[0]["source"] = "synthetic"
    rows[0]["protocol_version"] = "2.0"
    with pytest.raises(ValueError, match="one study"):
        analyze(rows)


def test_participants_weighted_equally_with_repeated_trials():
    rows = synthetic_trials(3)
    expected = analyze(rows)["paired"]
    repeated = deepcopy(rows[0])
    repeated["trial_id"] += "-repeat"
    assert analyze(rows + [repeated])["paired"] == expected


def test_empty_export_and_custom_cells():
    assert analyze([])["quality"]["observed_completion_rate"] is None
    rows = [r for r in synthetic_trials(3) if r["width"] == 24]
    assert analyze(rows)["paired"]["n_participants"] == 0
    assert analyze(rows, widths=[24])["paired"]["n_participants"] == 3


def test_eligibility_withdrawal_effort_and_rederived_timing():
    rows = synthetic_trials(3)
    rows[0]["session_status"] = "withdrawn"
    rows[1]["eligibility"] = "excluded"
    rows[2]["movement_time_ms"] += 5
    report = analyze(rows)
    assert report["quality"]["reasons"] == {
        "session_withdrawn": 1,
        "researcher_excluded": 1,
        "first_attempt_time_mismatch": 1,
    }
    assert report["effort"]["n_participants"] == 3


def test_private_ids_do_not_propagate_to_aggregate_pdf():
    from io import BytesIO

    from hip_analysis.report import write_report

    result = analyze(synthetic_trials(2))
    buffer = BytesIO()
    write_report(result, buffer)
    assert buffer.getvalue().startswith(b"%PDF-")
    assert b"DEMO-P001" not in buffer.getvalue()
