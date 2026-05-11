# Product&Project Mg Review - Documentation Baseline Cleanup

## Metadata

- Review ID: REVIEW-DOCS-BASELINE-CLEANUP-001
- Date: 2026-05-12
- Role: Product&Project Mg
- Source handoff: `docs/handoffs/outbox/HANDOFF-DOCS-BASELINE-CLEANUP-001.md`
- Status: Complete

## Changed Documentation

- `AGENTS.md`
- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- `docs/TEST_PLAN.md`
- `docs/DEPLOY.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`

## Cleanup Summary

Documentation is now aligned to the current baseline:

- Internal MVP is accepted and baseline-stabilized.
- Current MVP is local-first.
- Public release, Chrome Web Store, tag, push, merge, publish, deploy, upload, and submit remain unapproved.
- Google Sync/OAuth, Arrange advancement, system reminder notifications, and ManageBac subscription are future/out-of-current-scope.
- Data model docs reflect D-013:
  - `tasks`, `containers`, `events`, and `habits`: string UUID ids.
  - planner helper records such as `plans`, `buckets`, and `labels`: may remain numeric for now.
- Architecture docs reflect current manifest version `0.1.0`, local-first permissions, `sync.js` stub boundary, and no remote Google Fonts dependency.
- Module docs reflect current Settings and Popup MVP behavior.
- Test plan includes Phase 2A baseline safety checks and no longer expects Settings to load active sync behavior.
- Deploy docs are marked as future release reference only.

## Static Documentation Checks

Searches run:

- stale current-state terms: `MVP 开发中`, `Settings (待实现)`, `container_id?: number`, `id: number; // auto-increment`, `"version": "1.0.0"`, `fonts.googleapis`, `fonts.gstatic`, `where('synced')`, `identity.email`
- future/out-of-scope terms: `Google Sync`, `ManageBac`, `Chrome Web Store`, `OAuth`, `notifications`, `alarms`

Result:

- No unqualified stale current-state terms remain in the cleaned authority/product docs.
- Remaining future/out-of-scope terms are intentionally preserved with clear boundary language or as static-check targets.

`git diff --check` on touched docs: PASS, LF/CRLF warnings only.

## Remaining Risks

- Historical release reports and prior handoffs still contain then-current findings and old-risk language. They were not rewritten because they are evidence records.
- Full unpacked-extension acceptance remains separate from this documentation cleanup.
- Public release readiness is still not approved.

## No-Code Confirmation

No product code or test code was modified by this documentation cleanup.

## Recommended Next Work

The baseline is now ready for Product Owner to choose the next product direction.

Recommended next candidates:

1. Product planning for the next feature package.
2. Full manual unpacked-extension acceptance pass if preparing a broader internal milestone.
3. Git hygiene / commit planning, if Product Owner wants to preserve the completed baseline work in version control.
