# HIP Lab · Pointing study protocol 1.0

## Objective and hypotheses

Estimate the within-person difference in first-attempt pointing latency when using a mouse and a trackpad. Before opening recruitment, save the protocol version, primary outcome, directional or two-sided hypotheses, recruitment target, and stopping rule. Treat changes after collection starts as amendments.

- Primary hypothesis H1. Mean first-attempt pointing latency differs between input methods (two-sided).
- Secondary H2. Smaller targets increase first-attempt error frequency.
- Secondary H3. Greater center-to-center distance increases time at a fixed width.
- Exploratory. Examine speed–accuracy tradeoffs, self-rated effort by device, order effects, and the fit of movement time against Shannon difficulty.

## Design and recruitment

Each participant uses both devices. The default factorial design crosses widths of 24, 40, and 64 CSS pixels with distances of 150, 300, and 450 CSS pixels in each device block. Balance mouse-first and trackpad-first assignments across enrolled sessions. Shuffle condition order within blocks and retain the assigned schedule. Record practice and measured trials separately. Pause for device changes, confirmation, and rest. Log departures from the assigned schedule.

Recruit desktop or laptop users who can consent and operate both devices for this protocol. Record eligibility decisions and invite people using other input methods to discuss alternative studies. Participation is voluntary. Permit stopping at any time. Set a pilot target based on available laboratory time, then use pilot *participant-level* variability and a smallest meaningful difference in milliseconds to justify a separately planned confirmatory sample. Trial count cannot substitute for participant count.

## Administration

1. Explain the task, event collection, voluntary context fields, storage period, and deletion procedure before consent.
2. Record consent before collecting characteristics or pointer telemetry. Give the participant their pseudonymous session reference and a private withdrawal mechanism.
3. Record device category, operating system, browser, display geometry, pixel ratio, hand preference, and familiarity. Keep device settings, zoom, display, seating and instructions constant across blocks when feasible.
4. Have the participant confirm each physical device. Browser pointer type cannot distinguish a mouse from a trackpad. Record researcher verification separately.
5. The default schedule has two practice selections and nine measured selections per device, for 22 scheduled trials. Ask participants to point quickly and accurately. Use a consistent start activation, destination reveal, primary-button selection convention, feedback and intertrial interval.
6. Capture effort by device after the task and debrief. Ask about discomfort and interruptions. Stop on request.

## Measurements and exclusion rules

The template targets 24 participants as a feasibility pilot. This target does not establish power for a population-level device comparison.

Use the same monotonic clock for each trial. Record activation, destination display, first selection, all subsequent selections, and final completion as supported by the browser. Define the implemented event convention and clock origin in the data dictionary. Browser-side acquisition time includes reaction and device/browser latency. It cannot isolate physical movement onset. Keep first-selection latency and eventual successful completion time distinguishable. Retain misses in timing summaries under the declared endpoint.

Use the activation-to-destination-center distance and rendered diameter for Shannon difficulty. Monitor focus, tab visibility, resize and pointer cancellation. Preserve interrupted records with reasons and exclude them from completed movement-time estimates. Keep practice, interruptions, missing geometry, invalid durations, ambiguous duplicates and condition mismatches visible in the quality report. Never discard a slow participant or trial solely for being an outlier. Document the number of participants and trials supporting each estimate.

### Instrument event convention

The primary-button down on the start target sets the monotonic time origin and triggers destination presentation. The first subsequent primary-button down is the first attempt. `movement_time_ms` ends at that attempt, including a miss. `acquisition_time_ms` ends at the first down inside the destination circle. `total_time_ms` includes the corresponding release. The primary timing estimand uses `movement_time_ms` for valid completed trials, with completion and interruptions reported alongside it. Compute D from the recorded activation position to the destination center and W from the rendered diameter. Input dispatch and painting introduce measurement uncertainty.

## Statistical plan

Estimate the primary trackpad-minus-mouse difference by comparing participant means over the same planned condition cells. Require complete paired cells for the primary comparison and report incomplete pairs. Report the difference in milliseconds, a paired 95% t interval, two-sided paired test and standardized paired effect when defined. Inspect the distribution of paired differences. Present secondary and exploratory comparisons as such. Describe learning and device order separately. Report means, medians, dispersion, percentiles, first-attempt errors, interruptions and endpoint definitions.

Model first-attempt latency as intercept plus slope times log2(1 + D/W). Fit separately by participant and input method before summarizing slopes. Inspect residuals and coverage across difficulty levels. A nominal difficulty-rate summary uses nominal ID divided by mean time in seconds within a condition. Effective-width throughput additionally requires adequate repeated endpoints projected onto the movement axis. The definitions and intended interpretation differ. [MacKenzie, throughput calculations](https://www.yorku.ca/mack/FittsLawSoftware/doc/Throughput.html)

## Validity, accessibility and ethics

Internal validity depends on counterbalancing, comparable practice, stable system settings and logging interruptions. Order, fatigue and practice may interact with device familiarity. Convenience recruitment and exclusion of people unable to use both devices constrain external validity. CSS pixels do not fix physical target size across displays. Input latency, acceleration, posture and self-reported effort limit construct validity. Small samples, missing device blocks, multiplicity and trial dependence limit statistical conclusion validity.

Provide keyboard-operable study information and researcher controls. The timed task specifically measures pointer acquisition and requires sufficient viewport space. Explain the limitation before consent. Offer withdrawal, breaks and voluntary accommodation discussion. Keep private raw traces local and suppress participant-level detail in public reporting. Synthetic records belong to a separate demonstration dataset. No participant findings exist until actual consented research is completed.
