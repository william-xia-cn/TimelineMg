# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-BUILDMVP-001
- Date: 2026-05-11
- From: Product&Project Mg
- To: Build&Test
- Related task: Local-first MVP implementation readiness pass for Internal MVP acceptance
- Related branch: current working branch
- Related files:
  - `AGENTS.md`
  - `PROJECT_WORKFLOW.md`
  - `PROJECT_MASTER.md`
  - `TASK_BOARD.md`
  - `DECISIONS.md`
  - `docs/agents/BuildTest.md`
  - `docs/DESIGN_v2.0.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DATA_MODEL.md`
  - `docs/MODULES.md`
  - `docs/TEST_PLAN.md`
- Status: Ready

## Purpose

Build&Test should prepare and execute the local-first MVP implementation readiness pass for Internal MVP acceptance.

## Context

Product Owner has confirmed Lightweight governance, Internal MVP acceptance as the active target, package / extension version `0.1.0`, design-doc version `v2.3`, and local-first MVP scope.

The MVP is not a public release and is not Chrome Web Store submission work.

## Source Of Truth

The receiver must read:

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- `docs/TEST_PLAN.md`

## Request

1. Inspect current implementation against the local-first MVP scope.
2. Implement only the missing MVP items that are necessary for Internal MVP acceptance.
3. Run required `scheduling.js` unit tests and produce implementation evidence.

## Scope

Allowed actions:

- Modify product code required for local-first MVP readiness.
- Modify test code required for `scheduling.js` unit coverage or directly relevant MVP verification.
- Update necessary technical documentation only if implementation facts change.
- Verify the following MVP areas:
  - IndexedDB / Dexie v4 data model.
  - Task Board basic CRUD.
  - Calendar container/event basic management.
  - Focus Dashboard.
  - Daily Settle.
  - Minimal Settings.
  - Minimal Popup.
  - `scheduling.js` unit tests.
  - Manual MVP validation checklist.

## Out Of Scope

Forbidden actions:

- Google Sync implementation.
- Arrange timetable advancement.
- Automatic priority promotion.
- Defense / squeezing rules.
- Reminder notification system.
- ManageBac ICS subscription.
- Chrome Web Store submission.
- Final release readiness decision.
- Git tag, push, merge, publish, deploy, upload, or submit.
- Broad refactors, migrations, or cleanup outside MVP readiness.

## Acceptance Criteria

Completion requires:

- MVP included areas are implemented or explicitly classified as already present.
- Any missing MVP area is fixed within scope or reported as blocked.
- `scheduling.js` unit tests pass or failures are reported with exact command and blocker classification.
- Manual MVP validation checklist is completed or blockers are listed.
- No excluded MVP item is implemented.
- No release readiness or public submission claim is made.

## Required Tests

Build&Test must run the smallest relevant test set, including:

- `node tests/scheduling.test.js`

If additional tests are required by the implementation changes, Build&Test should run the smallest relevant set and report exact commands/results.

## Required Evidence

The receiver must output:

- changed files
- behavior changes
- tests run
- test results
- manual MVP validation checklist result or explicit blockers
- known risks
- scope conformance summary using `Matched`, `Deviated`, `Missing`, or `Extra`
- out-of-scope confirmation

## Open Questions

Questions requiring Product Owner decision:

- Product Owner authority label/name is not recorded, but this does not block Build&Test implementation.
- Any discovered need to implement Google Sync, Arrange, public release, data migration, or release standard changes must return to Product Owner / Product&Project Mg before work continues.

## Expected Deliverable

Build&Test should provide a concise implementation report with changed files, behavior changes, test evidence, known risks, blockers, scope conformance, and explicit out-of-scope confirmation.
