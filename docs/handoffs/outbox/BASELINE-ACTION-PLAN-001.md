# Baseline Action Plan - Post Internal MVP Acceptance

## Metadata

- Plan ID: BASELINE-ACTION-PLAN-001
- Date: 2026-05-12
- Owner: Product&Project Mg
- Inputs:
  - Build&Test code audit result
  - `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`
  - `docs/handoffs/outbox/REVIEW-DOCS-AUDIT-001.md`
- Status: Awaiting Product Owner approval for implementation

## Current Stage

Internal MVP acceptance is approved by Product Owner. This is not public release readiness and does not approve Chrome Web Store, tag, push, merge, publish, deploy, upload, or submit.

The current stage is baseline stabilization before further feature work.

## Recommended Phase 1 - Corrective Build&Test Package

Product&Project Mg recommends approving one narrow Build&Test remediation package:

1. Fix Popup task actions.
   - `开始/继续` must either persist a real in-progress state or be removed/disabled.
   - `延后` must update `start_date` according to the approved MVP rule or be removed/disabled.
2. Unify Daily Settle task-pool filtering across Focus, Popup, and Calendar.
   - Canonical current rule: tasks with `start_date == null` or `start_date <= today` are eligible for the local-first MVP task pool, unless Product Owner decides otherwise.
3. Add minimal regression coverage.
   - Add or update tests only for the changed behavior.
   - Include at least scheduling/task-pool consistency evidence.
4. Preserve MVP exclusions.
   - Do not enable Google Sync, Arrange, automatic priority promotion, defense/squeezing rules, reminder notifications, ManageBac subscription, or Chrome Web Store behavior.

## Recommended Phase 1.5 - Architecture Decision

Before broader data-model cleanup, Product Owner should decide canonical id strategy.

Product&Project Mg recommendation:

- `tasks`, `containers`, `events`, and `habits`: string UUID ids.
- Planner helper records such as plans, buckets, and labels: may remain numeric for now.
- No schema migration should start until this is approved and tested.

## Recommended Phase 2 - Safety And Consistency Hardening

After Phase 1 behavior fixes:

1. Replace unsafe `innerHTML` rendering for user/ICS-controlled fields with `textContent` or a shared escape helper.
2. Remove or isolate `getPendingSyncLogs()` indexed query risk while sync remains out of MVP scope.
3. Consolidate default container initialization to `TimeWhereScheduling.initDefaultContainers()`.
4. Remove remote Google Fonts dependencies from extension pages or explicitly downgrade offline claims.
5. Move or gate demo/dev utilities inside `extension/`.
6. Hide, disable, or implement the unbound Settings initialization-template button.

## Recommended Phase 3 - Documentation Baseline Cleanup

After Product Owner approves the behavior and id decisions:

1. Update `docs/DATA_MODEL.md`.
2. Update `docs/ARCHITECTURE.md`.
3. Update `docs/MODULES.md`.
4. Update `docs/TEST_PLAN.md`.
5. Add a current-stage warning to `docs/DEPLOY.md`.
6. Adjust `AGENTS.md` stage wording from active MVP development to Internal MVP accepted / baseline stabilization.

## Handoff Draft For Build&Test

If Product Owner approves Phase 1, Product&Project Mg should create a Build&Test handoff with:

- Read first:
  - `AGENTS.md`
  - `PROJECT_WORKFLOW.md`
  - `PROJECT_MASTER.md`
  - `TASK_BOARD.md`
  - `DECISIONS.md`
  - `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`
  - `docs/handoffs/outbox/BASELINE-ACTION-PLAN-001.md`
  - relevant files under `extension/popup/`, `extension/pages/focus/`, `extension/pages/calendar/`, and `extension/shared/js/`
- Goal: implement Phase 1 corrective package only.
- Scope: Popup task actions, shared task-pool filtering, minimal regression tests.
- Out of scope: data schema migration, Google Sync, Arrange, notifications, ManageBac subscription, public release/CWS/git/deploy actions.
- Deliverables: changed files, exact behavior changes, tests run, remaining risks, no-release confirmation.

## Product Owner Decisions Needed

1. Approve or reject Phase 1 corrective Build&Test package.
2. Decide canonical id strategy. Product&Project Mg recommends UUID/string ids for app entities already using generated ids.
3. Decide whether P2 hardening should follow immediately after Phase 1 or wait for the next planning cycle.

## No-Modification Confirmation

This action plan does not modify product code or test code.
