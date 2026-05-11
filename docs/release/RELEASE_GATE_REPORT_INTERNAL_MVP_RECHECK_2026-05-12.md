# Release Gate Report Addendum

## Metadata

- Report ID: RELEASE-GATE-INTERNAL-MVP-RECHECK-2026-05-12
- Date: 2026-05-12
- Release/deployment target: Internal MVP acceptance
- Recheck scope: `REL-MVP-BLOCKER-001` only
- Related report: `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
- Related handoff: `docs/handoffs/outbox/HANDOFF-RELEASEMVP-RECHECK-001.md`
- Related review: `docs/handoffs/outbox/REVIEW-BLOCKER-REL-MVP-001.md`
- Prepared by: releaseMg
- Status: Final / Recheck Passed

## Source Documents

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
- `docs/handoffs/outbox/REVIEW-BLOCKER-REL-MVP-001.md`
- `docs/handoffs/outbox/HANDOFF-RELEASEMVP-RECHECK-001.md`
- `docs/TEST_PLAN.md`
- `extension/shared/js/db.js`

## Build&Test Fix Evidence Confirmed

| Evidence | Result | Notes |
|---|---|---|
| `extension/shared/js/db.js` implementation review | PASS | `TimeWhereDB.getHabits()` now uses `db.habits.toArray()` and sorts in memory by `created_at` descending. |
| Static search for old blocker pattern | PASS | No `db.habits.orderBy` / `habits.orderBy('created_at')` match remained in `extension/shared/js/db.js`. |
| `node --check extension/shared/js/db.js` | PASS | Syntax check passed. |
| `node tests/scheduling.test.js` | PASS | 83/83 passed. |

## Recheck Results

| Case | Result | Evidence | Notes |
|---|---|---|---|
| MV-01 Focus Dashboard first-load console smoke | PASS_WITH_MANUAL_EVIDENCE | Temporary Chromium unpacked-extension run opened `pages/focus/focus.html`; captured `errors: []`; page title was `TimeWhere - Focus Dashboard`; body contained `当下任务`; 3 enabled default containers existed; timeline rendered `自由时间`, `学习时间`, `自由时间` for today/tomorrow. | First `page.goto` attempt timed out while waiting for full `load`, likely due external font/resource load; rerun used `domcontentloaded` and explicit post-load wait, then captured the required console/render evidence. |

## Blocker Status

| Blocker ID | Previous status | Recheck status | Owner role | Notes |
|---|---|---|---|---|
| REL-MVP-BLOCKER-001 | Open / High | RESOLVED | Build&Test | Original Dexie `SchemaError: KeyPath created_at on object store habits is not indexed` did not reproduce in MV-01 smoke. |

## New Failed Items

- None found in this narrow recheck.

## Known Risks Preserved

- `docs/DATA_MODEL.md` describes container `id` as numeric auto-increment while current implementation uses generated string ids.
- `sync_log` remains local audit plumbing. It does not expose active cloud sync behavior in the MVP path, but schema/API consistency should be treated carefully in future sync work.
- `sync.js` is an explicit local-first MVP stub returning `success: false` / `reason: out_of_scope_for_mvp`; acceptable for Internal MVP, not public release readiness.
- Settings and Calendar still expose local `.ics` file import UI. releaseMg did not observe an active ManageBac URL subscription or cloud sync path in the prior acceptance pass.
- Internal MVP acceptance must not be confused with public release readiness, Chrome Web Store submission, tag, push, merge, publish, deploy, upload, or submit approval.

## Updated Readiness Recommendation

`READY FOR PRODUCT OWNER DECISION`

This recommendation applies only to Internal MVP acceptance after the narrow blocker recheck. It is not final release readiness and does not approve any public release, Chrome Web Store, tag, push, merge, publish, deploy, upload, or submit action.

## Product Owner Decision Required

- Product Owner final Internal MVP acceptance decision is required.
- No public release, Chrome Web Store submission, tag, push, merge, publish, deploy, upload, or submit action is approved by this addendum.

## Privacy Check

Evidence contains no private user identifier, token, cookie, password, account details, private screenshots, local profile path, or raw profile identifiers.
