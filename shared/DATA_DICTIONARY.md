# Data dictionary

Storage uses one study, one assigned session per pseudonymous enrollment, and one immutable record per submitted schedule position. There is no cross-study identity registry. The private researcher export contains **identifiable-to-the-session raw data** and must stay within the research environment. Public summaries must omit identifiers, free text and pointer paths. An export is a new copy with its own retention and deletion obligations.

## Protocol and session

| Field | Meaning |
|---|---|
| `study_id`, `protocol_version` | Study identifier and protocol revision accepted at consent. An immutable configuration snapshot and the exact assigned schedule are stored with the session. |
| `participant_id`, `session_id` | Random pseudonym and random enrollment identifier. Counts represent enrollments. The instrument cannot recognize returning individuals. |
| `consent_at`, `expires_at` | UTC Unix seconds of affirmative consent and deletion deadline. Expired records are inaccessible immediately and purged at startup and hourly while the service runs. |
| `status`, `session_status` | Session state. `in_progress` accepts collection, `completed` includes both effort responses after all slots, and `withdrawn` closes collection. Withdrawal excludes the session from dashboard trial summaries. Deletion removes the session and its dependent trials. |
| `order`, `seed` | Device block order and PRNG seed. Enrollment order alternates the starting device transactionally. Individual assignments persist after the database restarts. |
| `schedule`, `next_sequence` | Ordered practice and experimental slots. Sequence positions start at 1. A submitted interruption advances the schedule. |
| `trial_count`, `completed_trials` (session) | Number of submitted slots, including interrupted and practice records. Use trial `valid` and `practice` explicitly for successful experimental-trial counts. |
| `metadata` | Device category, OS/browser, display width/height in CSS px, device pixel ratio, device familiarity, dominant hand, optional accessibility context and currently confirmed physical device. Trial records retain the metadata in effect on submission. |
| `verified_methods`, `notes`, `eligibility`, `exclusion_reason` | Researcher review fields. An excluded participant requires a reason. Notes and optional context should omit names and contact details. |
| `effort` | Post-study self-rated effort values `effort_mouse` and `effort_trackpad` on a 1–7 scale. Missing until questionnaire submission. |
| `source` | `real` for the capture API. Synthetic data is generated separately and never written into these tables. |

## Trial and event export

| Field | Unit and definition |
|---|---|
| `trial_id`, `condition_id`, `sequence` | Random record identifier, human-readable method/width/distance cell, and one-based slot position. |
| `input_method`, `assigned_input_method` | Participant-confirmed physical device and assigned device. Pointer type alone cannot distinguish mouse and trackpad. |
| `width`, `distance`, `assigned_width`, `assigned_distance` | Scheduled circular target diameter and activation-to-target distance in CSS px. `target_distance` is an alias for scheduled distance. |
| `start_x/y`, `start_center_x/y`, `start_width` | Actual start down position and optional rendered start geometry. Coordinate origin is the upper-left of the task surface. |
| `target_x/y`, `target_width`, `actual_distance` | Rendered destination center and diameter in CSS px, plus Euclidean distance from the start down position. One CSS pixel of geometry tolerance accommodates fractional layout. |
| `started_at_ms`, `ended_at_ms` | Browser monotonic timestamps measured in milliseconds in the page's clock domain. Only within-trial differences have meaning after a navigation or reload. |
| `events` | Chronological array of `{type,t,x,y}`. The first event is the primary start down; subsequent primary downs are attempts. A hit is within the closed circular target. Release ends a successful trial. Optional `move` samples describe browser-dispatched trajectories; sampling intervals may be irregular. |
| `movement_time_ms` | First selection down minus start down, including first attempts that miss. Null when interrupted before the first attempt. Includes reaction and dispatch latency. |
| `acquisition_time_ms` | First successful destination down minus start down. Null if no hit was recorded. |
| `total_time_ms` | Final release or interruption timestamp minus start down. |
| `first_attempt_success` | Boolean result on the first destination attempt. Null if the participant made no attempt. |
| `misses`, `retry_count` | Count of out-of-target downs, and count of attempts beyond the first. They can differ for an interrupted trial. |
| `outcome`, `interruption_reason`, `valid`, `practice` | Completed or interrupted; documented reason when interrupted. Valid means completed with validated geometry and terminal events. Practice is an independent flag. |
| `metadata`, `effort` | Dictionaries in JSON. Nested values and event arrays are JSON-encoded in CSV. |

## Derivations and access

The server recomputes event-level measures before insertion, retains submitted raw events and geometry, and hashes the canonical submitted payload for idempotent retries. A second differing payload cannot replace a previously recorded trial. Study allocation, session progress and trial insertion use database transactions. Only participant-scoped bearer tokens can submit a trial. Authenticated researchers can export raw data and record exclusions. No participant token or password is included in an export.

The dashboard first-attempt error rate uses valid, non-practice trials and excludes withdrawn sessions and researcher-excluded participants. The session-completion rate uses all unexpired sessions as the denominator. Never infer participant attrition or a population effect from a single trial denominator. Study-level exports include withdrawn and excluded rows for authorized auditing; analysis must explicitly implement its population and approved withdrawal policy.

The private analysis result includes an analysis version, UTC calculation time, protocol reference and SHA-256 digest of the underlying ordered export (sorted JSON keys, compact separators and one trailing newline per row). Exclusion reasons remain linked to trial rows in the private quality audit. The private session audit endpoint records dated eligibility, reason and verification changes. Session deletion removes its review history. CSV prefixes spreadsheet formula-like text with an apostrophe; the JSON export preserves the original text.
