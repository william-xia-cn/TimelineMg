# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-BASELINE-P1-001
- Date: 2026-05-12
- From: Product&Project Mg
- To: Build&Test
- Related task: Baseline Phase 1 corrective implementation
- Related plan: `docs/handoffs/outbox/BASELINE-ACTION-PLAN-001.md`
- Related review: `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`
- Status: Ready

## Purpose

Build&Test should implement the approved Phase 1 corrective package after Project Baseline Audit.

This is not a feature expansion. It is a narrow baseline-stabilization pass to fix two P1 behavior risks before further development.

## Product Owner Decisions

Product Owner approved:

1. Phase 1 corrective Build&Test package.
2. Canonical id strategy:
   - `tasks`, `containers`, `events`, and `habits`: string UUID ids.
   - Planner helper records such as plans, buckets, and labels may remain numeric for now.

Product Owner did not approve public release, Chrome Web Store submission, tag, push, merge, deploy, publish, upload, or submit.

## Read First

Build&Test must read:

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`
- `docs/handoffs/outbox/REVIEW-DOCS-AUDIT-001.md`
- `docs/handoffs/outbox/BASELINE-ACTION-PLAN-001.md`
- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- `docs/TEST_PLAN.md`

Implementation targets to inspect:

- `extension/popup/popup.js`
- `extension/popup/popup.html`
- `extension/pages/focus/script.js`
- `extension/pages/calendar/script.js`
- `extension/shared/js/db.js`
- `extension/shared/js/scheduling.js`
- `tests/`

## Goal

Implement only the Phase 1 corrective package:

1. Fix Popup task actions.
2. Unify Daily Settle task-pool filtering across Focus, Popup, and Calendar.
3. Add minimal regression coverage for the changed behavior.

## Scope

Allowed:

- Modify product code only where needed for the two P1 fixes.
- Modify or add tests only where needed for regression coverage.
- Refactor narrowly if it directly supports shared task-pool filtering.
- Update `TASK_BOARD.md` only with concise implementation status/evidence if useful.

Expected behavior:

- Popup `开始/继续` must either persist a real task state or be removed/disabled.
- Popup `延后` must update `start_date` according to MVP behavior or be removed/disabled.
- Product&Project Mg recommendation: implement the actual MVP behavior rather than hiding controls, unless code evidence makes that risky.
- Daily Settle canonical current rule:
  - tasks with `start_date == null` or `start_date <= today` are eligible for the local-first MVP task pool;
  - completed/done tasks remain excluded according to existing MVP behavior;
  - preserve existing priority/order behavior unless directly tied to the task-pool bug.

## Out Of Scope

Do not:

- Perform broad refactors.
- Redesign IndexedDB schema.
- Run a data migration.
- Change canonical id strategy implementation beyond respecting the approved decision.
- Enable Google Sync.
- Implement Arrange timetable advancement.
- Implement automatic priority promotion.
- Implement defense / squeezing rules.
- Implement reminder notification system.
- Implement ManageBac ICS subscription.
- Add Chrome Web Store or public release behavior.
- Modify release reports.
- Decide final release readiness.
- Create git tag, push, merge, publish, deploy, upload, submit, or Chrome Web Store submission.

## Acceptance Criteria

The task is complete when:

- Popup task action behavior is no longer half-implemented.
- Daily Settle task-pool filtering is consistent across Focus, Popup, and Calendar.
- Minimal regression tests or equivalent automated checks cover the corrected behavior.
- Existing `node tests/scheduling.test.js` still passes.
- Modified JavaScript files pass `node --check`.
- No out-of-scope MVP exclusions are reintroduced.
- Build&Test reports changed files, exact behavior changes, tests run, remaining risks, and confirms no release/git/deploy actions.

## Required Tests

Run at minimum:

- `node tests/scheduling.test.js`
- `node --check` on modified JavaScript files

Add and run any focused tests needed for:

- shared task-pool eligibility;
- Popup start/defer behavior if testable without browser automation.

If browser/manual validation is needed, report it clearly as manual evidence or remaining risk. Do not hand directly to releaseMg.

## Deliverables

Return results to Product&Project Mg with:

- Changed files list
- Exact fix summary
- Behavior changes
- Tests run and results
- Any manual checks run
- Remaining risks
- Scope conformance
- Explicit confirmation:
  - no Google Sync / Arrange / notifications / ManageBac subscription / CWS work;
  - no release readiness decision;
  - no tag / push / merge / publish / deploy / upload / submit.

## Handoff Back

Build&Test must return the result to Product&Project Mg first.

Product&Project Mg will review the implementation before deciding whether releaseMg should perform any recheck.
