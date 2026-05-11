# Product&Project Mg Review - Baseline Phase 1 Corrective Package

## Metadata

- Review ID: REVIEW-BASELINE-P1-001
- Date: 2026-05-12
- Reviewer: Product&Project Mg
- Reviewed handoff: `docs/handoffs/outbox/HANDOFF-BASELINE-P1-001.md`
- Build&Test result: Phase 1 corrective package completed
- Status: Cleared for narrow releaseMg recheck

## Scope Reviewed

Changed files reported by Build&Test:

- `extension/shared/js/scheduling.js`
- `extension/pages/focus/script.js`
- `extension/pages/calendar/script.js`
- `extension/popup/popup.js`
- `tests/scheduling.test.js`

Product&Project Mg inspected the modified implementation and reran focused checks.

## Verification Run By Product&Project Mg

- `node tests/scheduling.test.js`: PASS, 85/85
- `node --check extension/shared/js/scheduling.js`: PASS
- `node --check extension/pages/focus/script.js`: PASS
- `node --check extension/pages/calendar/script.js`: PASS
- `node --check extension/popup/popup.js`: PASS
- `node --check tests/scheduling.test.js`: PASS
- `git diff --check -- extension/shared/js/scheduling.js extension/pages/focus/script.js extension/pages/calendar/script.js extension/popup/popup.js tests/scheduling.test.js`: PASS, with LF/CRLF warnings only

## Findings

No blocking issues found in Product&Project Mg review.

| Requirement | Review result | Notes |
|---|---|---|
| Popup task actions no longer toast-only | PASS | Popup now calls `TimeWhereDB.startTask(task.id)` and `TimeWhereDB.updateTask(task.id, { start_date })`. |
| Daily Settle task-pool filtering unified | PASS | Focus, Popup, and Calendar now use `TimeWhereScheduling.buildDailyTaskPool()`. |
| `start_date == null` tasks included | PASS | Shared helper includes unfinished tasks where `start_date == null || start_date <= reference day`. |
| Future `deferred_until` tasks excluded | PASS | Shared helper excludes tasks deferred beyond the reference time. |
| Minimal regression coverage added | PASS | `tests/scheduling.test.js` now covers `buildDailyTaskPool()` and `getDeferredStartDate()`. |
| Scope boundaries preserved | PASS | No schema migration, Google Sync, Arrange, notifications, ManageBac subscription, CWS, release, tag, push, merge, deploy, upload, or submit work observed. |

## Residual Risk

No real Chrome UI validation was run in this Product&Project Mg review. Popup click behavior is supported by code inspection and unit/syntax checks, but should be verified through a narrow browser/manual recheck before considering baseline Phase 1 closed.

Existing broader baseline risks remain out of this package:

- Documentation baseline drift.
- DOM escaping / `innerHTML` rendering risks.
- `sync_log.synced` latent indexed-query risk.
- Default container initialization duplication.
- Remote Google Fonts dependency.
- Demo/dev utility cleanup.

## PM Conclusion

Build&Test Phase 1 corrective package conforms to the approved scope and is ready for a narrow releaseMg recheck of affected Internal MVP flows.

This review does not declare public release readiness and does not approve Chrome Web Store, tag, push, merge, publish, deploy, upload, or submit.

## Next Action

Send `docs/handoffs/outbox/HANDOFF-RELEASE-BASELINE-P1-RECHECK-001.md` to releaseMg.
