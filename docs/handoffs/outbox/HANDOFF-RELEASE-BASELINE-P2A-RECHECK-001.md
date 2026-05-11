# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-RELEASE-BASELINE-P2A-RECHECK-001
- Date: 2026-05-12
- From: Product&Project Mg
- To: releaseMg
- Related implementation handoff: `docs/handoffs/outbox/HANDOFF-BASELINE-P2A-SAFETY-001.md`
- Related PM review: `docs/handoffs/outbox/REVIEW-BASELINE-P2A-SAFETY-001.md`
- Status: Ready

## Purpose

releaseMg should perform a narrow recheck after Phase 2A safety hardening.

This is not a full public release gate. It is a focused Internal MVP baseline recheck for the affected safety-hardening surfaces only.

## Read First

releaseMg must read:

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/handoffs/outbox/HANDOFF-BASELINE-P2A-SAFETY-001.md`
- `docs/handoffs/outbox/REVIEW-BASELINE-P2A-SAFETY-001.md`
- `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P1-RECHECK-001.md`
- `docs/TEST_PLAN.md`

Inspect affected files as needed:

- `extension/shared/js/scheduling.js`
- `extension/shared/js/db.js`
- `extension/pages/focus/focus.html`
- `extension/pages/focus/script.js`
- `extension/pages/calendar/calendar.html`
- `extension/pages/calendar/script.js`
- `extension/pages/settings/settings.html`
- `extension/pages/settings/script.js`
- `extension/pages/tasks/tasks.html`
- `extension/pages/tasks/script.js`
- `extension/pages/tasks/board.js`
- `extension/popup/popup.html`
- `extension/popup/popup.js`
- `tests/scheduling.test.js`
- `tests/baseline-safety.test.js`

## Goal

Verify that Phase 2A safety hardening did not regress Internal MVP baseline behavior and that the targeted risks are resolved.

## Recheck Scope

Recheck only:

1. Page smoke after render-path hardening:
   - Focus Dashboard loads without console errors.
   - Calendar loads without console errors.
   - Settings loads without console errors.
   - Task Board loads without console errors.
   - Popup loads without console errors if a real extension context is available.
2. Safety-hardening evidence:
   - No direct remote Google Fonts dependency remains in extension pages.
   - No old unindexed `where('synced')` query remains.
   - No demo reseed helpers remain exposed.
   - `extension/shared/js/test-events.html` is not in the extension package path.
3. Local-first MVP boundary:
   - Google Sync remains disabled/out of scope.
   - Arrange remains disabled/out of scope.
   - Notifications remain not implemented as a system notification feature.
   - ManageBac subscription remains not implemented.

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
- Evidence for affected page load/smoke behavior.
- Evidence for the targeted static safety checks.
- Automated checks rerun or sampled.
- Any new blocker, if found, with owner and severity.
- Confirmation that no release/public/git/deploy action was performed.

## Suggested Checks

Automated:

- `node tests/scheduling.test.js`
- `node tests/baseline-safety.test.js`
- `node --check` on modified JS/test files
- Static search for old safety-risk patterns.

Manual/browser if available:

- Load affected extension pages in a real Chrome extension context.
- Confirm page titles / primary UI sections render.
- Confirm console has no Phase 2A-related errors.
- Confirm icon rendering is acceptable after removing remote Google Fonts.

## Deliverables

Return to Product&Project Mg:

- Recheck report path, if created
- Recheck result
- Evidence summary
- New blockers, if any
- Known risks preserved
- Explicit no public release / CWS / tag / push / merge / publish / deploy / upload / submit confirmation

## Handoff Back

Return the result to Product&Project Mg. Product Owner keeps final product and release/deployment authority.
