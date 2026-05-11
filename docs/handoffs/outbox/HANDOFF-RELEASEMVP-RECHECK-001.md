# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-RELEASEMVP-RECHECK-001
- Date: 2026-05-12
- From: Product&Project Mg
- To: releaseMg
- Related task: Recheck `REL-MVP-BLOCKER-001`
- Related release report: `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
- Related review: `docs/handoffs/outbox/REVIEW-BLOCKER-REL-MVP-001.md`
- Status: Ready

## Purpose

Rerun the narrow releaseMg acceptance recheck after Build&Test fixed `REL-MVP-BLOCKER-001`.

## Context

releaseMg previously returned `NOT READY` because MV-01 failed with:

```text
SchemaError: KeyPath created_at on object store habits is not indexed
```

Build&Test fixed the blocker by changing `TimeWhereDB.getHabits()` to avoid ordering the `habits` store by unindexed `created_at`; Product&Project Mg reviewed the fix and cleared it for releaseMg recheck.

## Source Of Truth

The receiver must read:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
- `docs/handoffs/outbox/REVIEW-BLOCKER-REL-MVP-001.md`
- `docs/TEST_PLAN.md`
- `extension/shared/js/db.js`

## Request

1. Recheck `REL-MVP-BLOCKER-001`.
2. Rerun MV-01 Focus Dashboard first-load console smoke.
3. If relevant, sample only the acceptance checks needed to ensure the blocker fix did not disturb Internal MVP acceptance.
4. Update the releaseMg recommendation or produce a blocker recheck report.

## Scope

Allowed actions:

- Read code and evidence.
- Rerun approved acceptance checks for Internal MVP acceptance.
- Rerun MV-01 and related Focus first-load browser checks.
- Record pass/fail/blocker result.
- Update release report or create an addendum report.

## Out Of Scope

Forbidden actions:

- Modifying product code.
- Modifying test code.
- Fixing bugs.
- Lowering release standards.
- Declaring final release decision.
- Chrome Web Store submission.
- Public release, tag, push, merge, publish, deploy, upload, or submit.

## Acceptance Criteria

Completion requires:

- `REL-MVP-BLOCKER-001` is classified as resolved or still open with evidence.
- MV-01 result is recorded after the fix.
- Any new blocker is classified by owner role.
- Internal MVP readiness recommendation is updated.
- Product Owner final decision remains required.

## Required Evidence

releaseMg final output must include:

- recheck scope
- MV-01 result
- blocker status for `REL-MVP-BLOCKER-001`
- any new failed items
- known risks preserved
- updated readiness recommendation
- Product Owner final decision required

## Open Questions

Questions requiring Product Owner decision:

- None before recheck. If recheck passes, Product Owner still owns final Internal MVP acceptance decision.

## Expected Deliverable

releaseMg should provide either:

- a release report addendum with updated recommendation; or
- a blocker recheck report if `REL-MVP-BLOCKER-001` remains open or a new blocker appears.
