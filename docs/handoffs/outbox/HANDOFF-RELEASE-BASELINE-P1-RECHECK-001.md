# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-RELEASE-BASELINE-P1-RECHECK-001
- Date: 2026-05-12
- From: Product&Project Mg
- To: releaseMg
- Related implementation handoff: `docs/handoffs/outbox/HANDOFF-BASELINE-P1-001.md`
- Related PM review: `docs/handoffs/outbox/REVIEW-BASELINE-P1-001.md`
- Status: Ready

## Purpose

releaseMg should perform a narrow recheck after the approved Phase 1 corrective package.

This is not a full public release gate. It is a focused Internal MVP baseline recheck for the affected flows only.

## Read First

releaseMg must read:

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/handoffs/outbox/HANDOFF-BASELINE-P1-001.md`
- `docs/handoffs/outbox/REVIEW-BASELINE-P1-001.md`
- `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_RECHECK_2026-05-12.md`
- `docs/TEST_PLAN.md`

Inspect affected files as needed:

- `extension/shared/js/scheduling.js`
- `extension/pages/focus/script.js`
- `extension/pages/calendar/script.js`
- `extension/popup/popup.js`
- `tests/scheduling.test.js`

## Goal

Verify that the Phase 1 corrective package did not regress Internal MVP baseline behavior and that the two P1 issues are resolved in user-facing flows.

## Recheck Scope

Recheck only:

1. Popup current-task actions:
   - `开始/继续` persists task state.
   - `完成` still completes the current task.
   - `延后` persists tomorrow's `start_date` and removes the task from the current task pool.
2. Daily Settle task-pool consistency:
   - Focus, Popup, and Calendar include unfinished `start_date == null` tasks consistently.
   - Completed tasks are excluded.
   - Future deferred tasks are excluded.
3. Basic affected-page smoke:
   - Focus Dashboard loads without console errors caused by the Phase 1 change.
   - Calendar week view loads and projects container tasks.
   - Popup loads and action buttons are not toast-only.

## Out Of Scope

Do not:

- Modify product code.
- Modify test code.
- Modify docs except a release/recheck report if needed.
- Reopen full Internal MVP acceptance unless a blocker is found.
- Decide public release readiness.
- Enable Google Sync.
- Implement Arrange.
- Implement notifications.
- Implement ManageBac subscription.
- Submit to Chrome Web Store.
- Create tag, push, merge, publish, deploy, upload, or submit.

## Acceptance Criteria

The recheck is complete when releaseMg reports:

- Recheck result: `PASS`, `PASS_WITH_MANUAL_EVIDENCE`, or `FAIL`.
- Evidence for Popup start/complete/defer behavior.
- Evidence for Focus/Popup/Calendar task-pool consistency, especially `start_date == null`.
- Automated checks rerun or sampled.
- Any new blocker, if found, with owner and severity.
- Confirmation that no release/public/git/deploy action was performed.

## Suggested Checks

Automated:

- `node tests/scheduling.test.js`
- `node --check` on modified JS files

Manual/browser if available:

- Load unpacked extension or affected HTML pages in a real Chrome extension context.
- Create or verify one unfinished task with `start_date == null`.
- Confirm it appears in Focus/Popup and is projected in Calendar container tasks.
- From Popup, click start/continue and verify persisted in DB/UI state.
- From Popup, click defer and verify `start_date` becomes tomorrow and the task leaves current pool.
- Complete task and verify it no longer appears in current pool.

## Deliverables

Return to Product&Project Mg:

- Recheck report path, if created
- Gate/recheck result
- Evidence summary
- New blockers, if any
- Known risks preserved
- Explicit no public release / CWS / tag / push / merge / publish / deploy / upload / submit confirmation

## Handoff Back

Return the result to Product&Project Mg. Product Owner keeps final product and release/deployment authority.
