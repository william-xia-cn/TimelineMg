# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-DOCS-BASELINE-CLEANUP-001
- Date: 2026-05-12
- From: Product&Project Mg
- To: Product&Project Mg
- Related docs audit: `docs/handoffs/outbox/REVIEW-DOCS-AUDIT-001.md`
- Related Phase 2A receipt: `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P2A-RECHECK-001.md`
- Status: Ready

## Purpose

Product&Project Mg should clean up baseline documentation after Phase 1 and Phase 2A stabilization.

This is documentation-only cleanup. It should align durable docs with current accepted local-first MVP state and known future/out-of-scope boundaries.

## Read First

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/handoffs/outbox/REVIEW-DOCS-AUDIT-001.md`
- `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`
- `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P1-RECHECK-001.md`
- `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P2A-RECHECK-001.md`
- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- `docs/TEST_PLAN.md`
- `docs/DEPLOY.md`

## Scope

Allowed documentation updates:

1. Mark current state as Internal MVP accepted plus baseline-stabilized, not public release ready.
2. Align data model docs with D-013:
   - `tasks`, `containers`, `events`, and `habits`: string UUID ids.
   - plans/buckets/labels may remain numeric for now.
3. Clarify Google Sync, Arrange, notifications, ManageBac subscription, and Chrome Web Store as out of current MVP/public-release scope.
4. Align architecture docs with current local-first manifest/permissions and `sync.js` stub status.
5. Align modules docs with current MVP behavior after Phase 1 and Phase 2A.
6. Align test plan with current local-first MVP checks and Phase 2A safety checks.
7. Add a current-stage warning to deploy/release docs that no public release/CWS/git/deploy action is approved.
8. Update `AGENTS.md` wording if needed from active MVP development to Internal MVP accepted / baseline stabilization.

## Out Of Scope

Do not:

- Modify product code.
- Modify test code.
- Change product scope.
- Approve public release.
- Enable Google Sync, Arrange, notifications, ManageBac subscription, or Chrome Web Store submission.
- Create tag, push, merge, publish, deploy, upload, or submit.

## Acceptance Criteria

- Documentation no longer presents future/out-of-scope features as current MVP implementation.
- Documentation records current local-first MVP baseline accurately.
- Data model id strategy matches D-013.
- Test plan no longer expects removed sync or notification behavior as active MVP.
- Deploy/CWS docs are clearly marked not approved for current stage.
- Remaining risks are preserved, not erased.

## Required Tests

No product tests required.

Run documentation/static checks as useful, such as searching for stale phrases:

- `Google Sync`
- `Chrome Web Store`
- `notifications`
- `identity`
- `alarms`
- `1.0.0`
- `auto-increment`
- `container_id?: number`
- `Settings (待实现)`
- `MVP 开发中`

## Deliverables

Return:

- Changed files list
- Summary of documentation alignment
- Remaining documentation risks
- No product/test code modification confirmation
- Recommended next work package after docs cleanup
