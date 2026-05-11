# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-BASELINE-P2A-SAFETY-001
- Date: 2026-05-12
- From: Product&Project Mg
- To: Build&Test
- Related plan: `docs/handoffs/outbox/BASELINE-ACTION-PLAN-001.md`
- Related audit: `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`
- Related Phase 1 closure: `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P1-RECHECK-001.md`
- Status: Ready

## Purpose

Build&Test should perform Phase 2A safety hardening after Phase 1 baseline risks were closed.

This is a corrective hardening package, not feature expansion.

## Product Owner / Product&Project Mg Direction

Product Owner delegated next-step planning/execution sequencing to Product&Project Mg on 2026-05-12.

Product&Project Mg selected Phase 2A safety hardening as the next work package before documentation baseline cleanup.

This does not approve public release, Chrome Web Store submission, tag, push, merge, publish, deploy, upload, or submit.

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
- `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P1-RECHECK-001.md`
- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- `docs/TEST_PLAN.md`

Likely implementation files to inspect:

- `extension/shared/js/db.js`
- `extension/shared/js/scheduling.js`
- `extension/pages/focus/script.js`
- `extension/pages/calendar/script.js`
- `extension/pages/settings/script.js`
- `extension/pages/settings/settings.html`
- `extension/popup/popup.js`
- `extension/popup/popup.html`
- `extension/pages/tasks/script.js`
- `extension/pages/tasks/board.js`
- `extension/shared/js/test-events.html`
- `tests/`

## Goal

Reduce remaining baseline safety and consistency risks without changing product scope.

## Scope

Approved Phase 2A scope:

1. Safe rendering for user/ICS-controlled fields.
   - Replace unsafe `innerHTML` interpolation or use a shared escaping helper where DOM structure still requires template strings.
   - Cover task title/notes, event title, container name, Popup current task title, and Calendar container task titles where affected.
2. `sync_log.synced` latent Dexie query risk.
   - Since Google Sync remains out of MVP scope, remove/isolate the indexed `where('synced')` path or change it to safe scan/filter.
   - Do not implement cloud sync.
3. Default container initialization consistency.
   - Keep `TimeWhereScheduling.initDefaultContainers()` as the single source of default container creation where practical.
   - Remove or route old duplicate `createDefaultContainers()` paths if they are still active.
4. Remote font dependency cleanup for local-first MVP.
   - Remove direct `fonts.googleapis.com` / `fonts.gstatic.com` dependencies from extension pages if local icon/font fallback already exists.
   - Do not add network permissions.
5. Demo/dev utility gating or relocation.
   - Move, disable, or gate `extension/shared/js/test-events.html` so it is not an active extension asset.
   - Remove or gate destructive console demo helpers such as `clearAndReseed()`.
6. Unbound Settings initialization-template button.
   - Hide, disable, or implement minimal safe behavior.
   - Prefer hiding/disabled state if product behavior is not specified.

## Out Of Scope

Do not:

- Add new product features.
- Redesign UX flows beyond hiding/guarding unsafe or unimplemented surfaces.
- Perform broad refactors.
- Perform IndexedDB schema migrations.
- Change canonical id strategy beyond respecting D-013.
- Enable Google Sync.
- Implement Arrange timetable advancement.
- Implement automatic priority promotion.
- Implement defense / squeezing rules.
- Implement reminder notification system.
- Implement ManageBac ICS subscription.
- Add Chrome Web Store or public release behavior.
- Modify release reports.
- Decide release readiness.
- Create git tag, push, merge, publish, deploy, upload, submit, or Chrome Web Store submission.

## Acceptance Criteria

The task is complete when:

- User/ICS-controlled text in the audited surfaces is no longer directly injected as unsafe markup.
- `getPendingSyncLogs()` or equivalent pending-sync path can no longer throw a Dexie SchemaError due to unindexed `synced`.
- Default container initialization no longer has multiple active inconsistent creation paths.
- Extension pages no longer depend on remote Google Fonts for MVP operation, or any remaining dependency is explicitly justified as unavoidable.
- Demo/dev utilities cannot be casually executed from the production extension surface.
- The unbound Settings initialization-template button is no longer a half-usable control.
- Existing scheduling tests still pass.
- Modified JavaScript files pass syntax checks.
- Any added focused tests pass.
- No out-of-scope feature or release action is introduced.

## Required Tests / Checks

Run at minimum:

- `node tests/scheduling.test.js`
- `node --check` on every modified JavaScript file
- focused static checks for:
  - remaining `fonts.googleapis.com` / `fonts.gstatic.com` extension-page references;
  - remaining `where('synced')`;
  - remaining active `clearAndReseed` exposure;
  - remaining direct unsafe interpolation in the touched render paths;
  - old duplicate default-container creation paths.

Add focused tests if practical for:

- HTML escaping helper behavior;
- `getPendingSyncLogs()` no longer depending on an unindexed query.

If a check cannot be automated, report the manual/static evidence clearly.

## Deliverables

Return results to Product&Project Mg with:

- Changed files list
- Exact fix summary by scope item
- Behavior changes
- Tests/checks run and results
- Remaining risks
- Scope conformance
- Explicit confirmation:
  - no Google Sync / Arrange / notifications / ManageBac subscription / CWS work;
  - no release readiness decision;
  - no tag / push / merge / publish / deploy / upload / submit.

## Handoff Back

Build&Test must return the result to Product&Project Mg first.

Product&Project Mg will review before deciding whether releaseMg needs a narrow recheck.
