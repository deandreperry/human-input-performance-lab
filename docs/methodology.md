# Analysis methods and reproduction

## Run from the repository root

Install the analysis and test extras as described in the README. These examples use the repository virtual environment.

```sh
PYTHONPATH=analysis .venv/bin/python -m hip_analysis --demo --out /tmp/hip-synthetic --figures --pdf
PYTHONPATH=analysis .venv/bin/jupyter lab analysis/notebooks
.venv/bin/python -m pytest analysis/tests
```

Download a private JSON trial export from an authenticated researcher session. Select one study and protocol version. Supply the study's planned levels if its configuration differs from the default.

```sh
PYTHONPATH=analysis .venv/bin/python -m hip_analysis --input private-trials.json \
  --widths 24 40 64 --distances 150 300 450 --out /tmp/hip-private --figures --pdf
```

The manifest records a SHA-256 digest of the source bytes, study levels, software versions and synthetic seed when applicable. The CLI preserves input bytes. A row-level exclusion ledger records every omitted record and its reasons. Private results and figures may identify participants through pseudonyms or distinctive trajectories. Keep them in researcher-controlled storage. Raw exports and analytical files require separate deletion when a participant withdraws.

## Measures and denominators

Each row represents a recorded trial. `movement_time_ms` runs from activation down to first attempt down. `acquisition_time_ms` ends at the first successful down. `total_time_ms` ends at release. Nominal factors describe the assigned condition. Geometry-based difficulty uses the measured activation-to-center distance and rendered target diameter. Completion among observed measured records omits unstarted trials and cannot estimate attrition across an entire planned session.

Validation checks identifiers, duplicate trial IDs, source mixing, assignment metadata, dimensions, D reconstructed from positions, event order and duration. Call `validate(rows, schedule)` with a session-sequence map to audit an external schedule. A duplicate ID excludes every copy. Exclusion categories can overlap. Interrupted and practice rows remain in the quality ledger. Descriptive output includes cell-level counts, means, medians, SD, p10/p90, first-attempt error frequency and the distribution of first-attempt latencies. Timing statistics use the first attempt. Error rates use valid completed measured trials, so attrition and interrupted counts must accompany them.

## Estimation

The primary contrast is the participant's mean trackpad latency minus mean mouse latency. First average repeated trials in each method × width × distance cell, then average cell differences with equal weights. Include participants with both methods in every planned cell and one eligible session. List incomplete pairs. Participants with zero eligible records appear in the quality ledger. The paired t model treats participants as independent units and differences as approximately normal. It reports mean difference, a two-sided 95% interval and p-value, and standardized mean difference divided by SD of paired differences (Cohen's dz). Sparse or zero-variance samples yield unavailable uncertainty estimates. Inspect paired differences and missingness before drawing conclusions. No automatic stopping rule follows from statistical significance.

Separate participant-by-device least-squares regressions estimate MT = a + b × ID. Report trial counts, slopes, intercepts, R² where defined, residual RMSE and mean residual by difficulty. One slope per participant/device prevents pooled trial regression from producing artificially narrow participant-level intervals. Inspect residual curvature, leverage at high difficulty, order, differential practice, fatigue and near-zero residual variance. Individual plots show dispersion hidden by group summaries. Trialwise residuals may be autocorrelated and non-Gaussian.

Width and distance contrasts, order effects and speed–accuracy relationships are exploratory. A lower mean latency paired with a higher error rate warrants examination of both outcomes. The default analysis conducts one prespecified primary test. Testing multiple secondary hypotheses requires a predefined family and adjustment (for example Holm); the pipeline emits no secondary p-values. Method-by-condition interaction tests, inferential effort comparisons, and random-slope mixed models require a separate analysis plan and adequate participant coverage.

The nominal rate divides cell mean Shannon ID by cell mean first-attempt time in seconds. Effective-width calculations require repeated first-attempt endpoints projected onto the movement axis; a few selections per cell cannot estimate their dispersion reliably. The nominal rate and regression slope are reported separately. [MacKenzie, throughput calculations](https://www.yorku.ca/mack/FittsLawSoftware/doc/Throughput.html)

## Effort and reporting

Effort is a paired ordinal rating from 1 to 7. The analysis deduplicates repeated questionnaire fields per participant, reports device medians and counts people rating the trackpad higher, lower or the same. Inconsistent responses and missing pairs cannot enter these counts. Explicitly excluded and withdrawn records cannot contribute to timing, accuracy or effort measures.

Add `--pdf` to export a sixteen-section aggregate report and optionally `--protocol protocol.json` to include the approved title, research question and hypotheses. The report prints the source on every page. A researcher should review free-text protocol fields before sharing the PDF. The PNG/SVG output includes individual traces and belongs with private data.

## Interpretation and reports

A synthetic result demonstrates code paths only. Describe effect magnitude and uncertainty for real observations; discuss transfer to other tasks or populations separately. The CLI creates private analytical outputs. Participant quotes and product recommendations require independent evidence and researcher review. The notebook defaults to fixed-seed synthetic records and contains no stored participant outputs.

## Browser demonstration fixture

The browser fixture uses 24 simulated pointing sessions (seed 713) and 12 simulated distance sessions (seed 714). Both study datasets use the pointing template. A third draft study has no data. The fixture includes incomplete sessions, interrupted records and withdrawn sessions with erased trials. A compact projection supplies the browser; the Python pipeline computes the study estimates from the full event records. The fixture date range is fixed to October 16 through November 12, 2026. These dates identify the simulation window.

```sh
.venv/bin/python analysis/generate_demo.py --check
.venv/bin/python analysis/generate_demo.py --study pointing --raw /tmp/hip-pointing-demo.json
PYTHONPATH=analysis .venv/bin/python -m hip_analysis --input /tmp/hip-pointing-demo.json --out /tmp/hip-pointing-report --pdf
```

The standalone CLI's `--demo` example intentionally uses 12 complete participants. Select a fixture study with `generate_demo.py --raw` to reproduce a browser report.
