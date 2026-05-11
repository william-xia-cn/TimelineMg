# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-BLOCKER-REL-MVP-001
- Date: 2026-05-11
- From: Product&Project Mg
- To: Build&Test
- Related task: Resolve release blocker REL-MVP-BLOCKER-001
- Related branch: current working branch
- Related files:
  - `AGENTS.md`
  - `PROJECT_MASTER.md`
  - `TASK_BOARD.md`
  - `DECISIONS.md`
  - `docs/agents/BuildTest.md`
  - `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
  - `extension/shared/js/db.js`
- Status: Ready

## Purpose

Fix the Focus Dashboard first-load Dexie schema error blocking Internal MVP acceptance.

## Context

releaseMg executed Internal MVP acceptance and returned `NOT READY`.

Release blocker:

```text
REL-MVP-BLOCKER-001
SchemaError: KeyPath created_at on object store habits is not indexed
```

The likely source is `TimeWhereDB.getHabits()` ordering by `created_at` while the `habits` store schema does not index `created_at`.

## Source Of Truth

The receiver must read:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
- `docs/TEST_PLAN.md`
- `extension/shared/js/db.js`

## Request

1. Fix `REL-MVP-BLOCKER-001` with the smallest scoped implementation change.
2. Preserve local-first MVP scope.
3. Return evidence for Product&Project Mg review and releaseMg MV-01 recheck.

## Scope

Allowed actions:

- Modify product code required to remove the Focus Dashboard first-load Dexie `SchemaError`.
- Modify directly relevant tests only if needed.
- Run relevant automated/static checks.
- Produce a blocker-fix implementation report.

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
- Broad data migration or schema redesign beyond the blocker unless unavoidable and explicitly justified.

## Acceptance Criteria

Completion requires:

- Focus Dashboard first load no longer emits `SchemaError: KeyPath created_at on object store habits is not indexed`.
- Existing `scheduling.js` unit tests still pass.
- Modified JavaScript files pass syntax check.
- Implementation remains within local-first MVP scope.
- Build&Test reports exact changed files, tests, results, risks, and out-of-scope confirmation.

## Required Evidence

The receiver must output:

- changed files
- behavior changes
- exact fix summary for `REL-MVP-BLOCKER-001`
- tests run
- test results
- residual risks
- scope conformance summary
- out-of-scope confirmation

## Open Questions

Questions requiring Product Owner decision:

- None currently. If the fix requires a durable data model decision such as changing container/habit id strategy or IndexedDB versioning policy beyond the blocker, stop and return to Product&Project Mg.

## Expected Deliverable

Build&Test should return a concise blocker-fix report. Product&Project Mg will review it before releaseMg reruns MV-01 / relevant acceptance checks.
