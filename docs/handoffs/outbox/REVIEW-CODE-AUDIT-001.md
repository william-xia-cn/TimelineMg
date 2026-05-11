# Product&Project Mg Review - Code Baseline Audit

## Metadata

- Review ID: REVIEW-CODE-AUDIT-001
- Date: 2026-05-12
- Reviewer: Product&Project Mg
- Source handoff: `docs/handoffs/outbox/HANDOFF-CODE-AUDIT-001.md`
- Source result: Build&Test Project Baseline Code Audit Report
- Status: Accepted for baseline planning

## Scope Confirmation

Build&Test completed a read-only code audit. The report states no product code, test code, documentation, git, release, deploy, publish, upload, submit, tag, push, merge, or Chrome Web Store action was performed.

Evidence reported by Build&Test:

- `node tests/scheduling.test.js`: PASS, 83/83
- JavaScript syntax checks for `extension/**/*.js` and `tests/**/*.js`: PASS
- Current working tree already contains modified/untracked files; audit did not introduce writes.

## Product&Project Mg Triage

### P1 - Must Fix Before Next Development

| Finding | PM classification | Required next action |
|---|---|---|
| Popup `开始/继续` and `延后` buttons show toast only and do not write DB state. | P1 behavior integrity issue | Build&Test should either implement real DB-backed start/defer behavior or hide/disable the controls. Product&Project Mg recommends implementing MVP-consistent behavior if Product Owner approves remediation. |
| Daily Settle task pool differs across Focus, Popup, and Calendar. | P1 cross-page consistency issue | Build&Test should centralize or otherwise unify task-pool filtering so `start_date == null` behavior is consistent across MVP surfaces. |

### P2 - Should Fix Soon

| Finding | PM classification | Required next action |
|---|---|---|
| User/ICS fields are rendered with unsafe `innerHTML` in several pages. | P2 local security and data-rendering risk | Use `textContent` or a shared escaping helper for user-controlled fields. |
| Data model id type mismatch between docs/schema/implementation. | P2 architecture/documentation decision | Product Owner should approve canonical id strategy before code/schema/doc cleanup. Product&Project Mg recommendation: canonical app entity ids for tasks/containers/events/habits should be string UUIDs because current implementation already writes generated ids. |
| `sync_log.synced` is queried with an unindexed Dexie `where('synced')`. | P2 latent runtime blocker | Since sync is out of MVP scope, either isolate/remove the path or change it to scan/filter until sync is deliberately reintroduced. |
| Default container initialization exists in multiple places. | P2 initialization consistency risk | Keep `TimeWhereScheduling.initDefaultContainers()` as the only default container source. |
| Extension pages still load Google Fonts remotely. | P2 local-first/offline reliability risk | Remove remote font dependency and rely on local/fallback fonts. |

### P3 - Track And Clean Up

| Finding | PM classification | Required next action |
|---|---|---|
| `extension/shared/js/test-events.html` is a demo/test utility inside extension tree. | P3 packaging hygiene | Move to `tests/manual` or archive outside extension package. |
| Task Board demo seeding helpers remain exposed on `window`. | P3 data safety risk | Remove or gate behind explicit development flag. |
| Settings has an unbound initialization-template button. | P3 UI completeness risk | Hide, disable, or implement minimal behavior. |

## Open Product Owner Decisions

1. Approve a remediation work package before Build&Test modifies code or tests.
2. Decide canonical id strategy. Product&Project Mg recommends:
   - `tasks`, `containers`, `events`, and `habits`: string UUID ids.
   - Internal planner helper records such as plans/buckets/labels may remain numeric until a separate data-model cleanup is approved.
3. Decide whether P2 DOM escaping and latent `sync_log` query risk should be included in the first remediation package or scheduled after P1 behavior fixes.

## PM Conclusion

The Build&Test audit is accepted as sufficient code baseline evidence. The next implementation package should be narrow and corrective, not feature expansion.

Recommended first package:

1. Fix Popup start/defer behavior.
2. Unify Daily Settle task-pool filtering.
3. Add minimal regression tests around the fixed behavior.

Do not send this to releaseMg yet. releaseMg becomes relevant after Build&Test implements an approved remediation package and Product&Project Mg reviews the result.
