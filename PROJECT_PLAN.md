# Human Input Performance Lab

## Architecture
Next.js App Router serves the researcher workspace, public case study and participant instrument. Same-origin API requests pass through Next to a loopback FastAPI server. SQLAlchemy persists versioned protocols, consent, sessions and raw trial events in SQLite. The analysis package consumes exports independently of the UI. Synthetic previews remain separate from collected records.

## Milestones and acceptance
1. Foundation — strict TypeScript builds, responsive navigation, accessible controls, local authentication, migrated database and typed contracts.
2. Instrument — researcher configures a study, participant consents, confirms each device, practices, completes randomized blocks and receives a debrief. Verify interruption handling, withdrawal and persistence.
3. Analysis — deterministic simulations, explicit quality decisions, participant-level estimates and reproducible notebook. Verify with known data.
4. Research workspace — scoped study, session and participant views, source-aware metrics, filters and empty states. Verify navigation and researcher access.
5. Reporting — aggregate-only reports, scoped exports and a separate case study. Verify export provenance.
6. Hardening — run unit, API, browser, accessibility, lint and build checks. Document results and remaining limitations.

## Release boundary
The first template is a desktop pointing study. WearLab would add a separate protocol, touch-based task component, condition schema and input-specific analysis. Its future factors include wrist support, posture, hand, task complexity, target size and distance.

## Implemented workflow

- **Foundation** — Next App Router and strict TypeScript, shared component styles and dark mode, validated Python contracts, local researcher credentials, SQLAlchemy models and Alembic migrations.
- **Instrument** — the pointing template supports consent receipts, session-scoped credentials, server-assigned schedules, confirmed device blocks, practice, measured trajectories, interruptions, optional rests, paired effort ratings and debrief.
- **Analysis** — validation produces an explicit exclusion ledger. Participant-level Fitts fits, within-person paired estimates, confidence intervals and effort summaries are reproducible from raw exports.
- **Workspace** — synthetic and live workspaces have distinct data sources. Date and trial filters update exploratory metrics. Study models explicitly use the full study. Session inspection supports review, trace visualization, eligibility and withdrawal-related deletion.
- **Reporting** — private raw exports, aggregate PDFs and Python chart exports are available. Live report history retains generation metadata; the PDF is regenerated from the current eligible data after withdrawals or exclusions.
- **Hardening** — disposable SQLite migrations and authenticated browser tests exercise both researcher and participant paths. The README records exact commands and outstanding physical-device, accessibility and database validation.

## Data and trust boundaries

Participants use a study-specific public enrollment link. The server generates the randomized schedule and checks incoming event geometry, sequence and timing. The recorded protocol snapshot and seed support reconstruction. Replayed identical submissions are idempotent. Changed replays and stale sequence positions fail.

A researcher cookie authorizes study management, session review and raw exports. A separate session bearer authorizes only one participant enrollment. Raw events stay immutable until retention or deletion. Review metadata and analysis exclusions remain separate. Live reports and notebooks derive their results from validated trial records. The public case study reads no private API.

A synthetic fixture projection supplies the preview and full study-specific raw fixtures supply demonstration exports. Demo edits stay in browser storage. Live participant records stay in the local database with a recovery receipt and pending checkpoint in the participant browser.
