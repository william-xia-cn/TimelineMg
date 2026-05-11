# Product&Project Mg Blocker-Fix Review

## Metadata

- Review ID: REVIEW-BLOCKER-REL-MVP-001
- Date: 2026-05-12
- Reviewer: Product&Project Mg
- Reviewed handoff: `docs/handoffs/outbox/HANDOFF-BLOCKER-REL-MVP-001.md`
- Related release report: `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
- Blocker: `REL-MVP-BLOCKER-001`
- Status: Ready for releaseMg recheck

## Current Stage Alignment

The project is in Internal MVP acceptance, after one releaseMg pass returned `NOT READY`.

Current phase goal:

- Verify the single blocker fix for `REL-MVP-BLOCKER-001`.
- Send only the relevant evidence back to releaseMg for a narrow recheck.
- Avoid new feature work, broad refactors, public release actions, or final release decisions.

## Conclusion

Build&Test fixed `REL-MVP-BLOCKER-001` within the approved local-first MVP scope.

This review clears the fix for releaseMg recheck. It does not declare Internal MVP ready and does not replace releaseMg acceptance.

## Reviewed Fix

Build&Test changed `TimeWhereDB.getHabits()` in `extension/shared/js/db.js`.

Before:

```text
db.habits.orderBy('created_at').reverse().toArray()
```

Problem:

```text
SchemaError: KeyPath created_at on object store habits is not indexed
```

After:

```text
db.habits.toArray()
```

Then sort in memory by `created_at` descending.

## Scope Conformance

| Item | Result | Notes |
|---|---|---|
| Fixes `REL-MVP-BLOCKER-001` root cause | Matched | Avoids ordering the `habits` store by an unindexed key path. |
| Preserves habit ordering behavior | Matched | Keeps newest-first ordering by sorting in memory. |
| Avoids schema/version migration | Matched | No IndexedDB version change or migration was introduced. |
| Local-first MVP scope | Matched | No Google Sync, Arrange, reminder, ManageBac, CWS, or release action work observed. |
| Evidence sufficient for PM review | Matched | Build&Test reported scheduling tests, JS syntax check, and static search all passing. |

## Build&Test Evidence Reviewed

- `node tests/scheduling.test.js`: PASS, 83/83.
- `node --check extension/shared/js/db.js`: PASS.
- Static search for `habits.orderBy` / `db.habits.orderBy`: PASS, no matches.

## Risks For releaseMg Recheck

| Risk | State | Owner | Required action |
|---|---|---|---|
| Browser MV-01 not rerun after fix | Open | releaseMg | Rerun MV-01 / Focus first-load console smoke. |
| Existing container id documentation mismatch | Open | Product&Project Mg / Build&Test | Not part of this blocker fix; keep as known risk. |
| Internal MVP only | Open | releaseMg | Do not treat recheck success as public release, CWS readiness, tag, push, merge, publish, deploy, upload, or submit approval. |

## releaseMg Recheck Instruction

releaseMg should perform a narrow recheck:

1. Read this review and the release report.
2. Confirm `REL-MVP-BLOCKER-001` fix evidence.
3. Rerun MV-01 / Focus Dashboard first-load console check.
4. If MV-01 passes and no new blocker appears, update the Internal MVP acceptance recommendation.
5. Preserve any remaining known risks.

releaseMg must not modify product code or test code, lower standards, claim final release readiness, or perform public release / Chrome Web Store / git tag / push / merge actions.
