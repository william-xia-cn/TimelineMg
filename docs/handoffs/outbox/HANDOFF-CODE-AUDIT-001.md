# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-CODE-AUDIT-001
- Date: 2026-05-12
- From: Product&Project Mg
- To: Build&Test
- Related task: Project Baseline Code Audit
- Related branch: current working branch
- Related files:
  - `AGENTS.md`
  - `PROJECT_WORKFLOW.md`
  - `PROJECT_MASTER.md`
  - `TASK_BOARD.md`
  - `DECISIONS.md`
  - `docs/agents/BuildTest.md`
  - `docs/DESIGN_v2.0.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DATA_MODEL.md`
  - `docs/MODULES.md`
  - `docs/TEST_PLAN.md`
  - `extension/`
  - `tests/`
- Status: Ready

## Purpose

Build&Test should perform a read-only baseline code audit to establish a trustworthy development foundation after Internal MVP acceptance.

## Context

Product Owner approved Internal MVP acceptance on 2026-05-12. The next approved stage is Project Baseline Audit.

Previous implementation work was not originally created under the current governance workflow. This audit must identify code risks and implementation/document mismatch before the next development phase.

## Source Of Truth

The receiver must read:

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- `docs/TEST_PLAN.md`
- Current implementation under `extension/`
- Current tests under `tests/`

## Request

1. Audit the current codebase against Internal MVP accepted scope and authority docs.
2. Identify bugs, architecture risks, dead/legacy code, data model mismatches, test gaps, and maintenance hazards.
3. Produce a code audit report only. Do not modify code or tests.

## Scope

Allowed actions:

- Read product code.
- Read test code.
- Run safe read-only inspection commands such as `rg`, `git diff`, `git status`, `node --check`, and existing tests if useful for audit evidence.
- Report findings with severity, file references, impact, and recommended owner.

Primary audit targets:

- `extension/manifest.json`
- `extension/background.js`
- `extension/shared/js/db.js`
- `extension/shared/js/scheduling.js`
- `extension/shared/js/sync.js`
- `extension/pages/tasks/*`
- `extension/pages/calendar/*`
- `extension/pages/focus/*`
- `extension/pages/settings/*`
- `extension/popup/*`
- `tests/*`

## Out Of Scope

Forbidden actions:

- Modifying product code.
- Modifying test code.
- Modifying documentation except for the final audit report if explicitly requested.
- Fixing bugs during the audit.
- Refactoring.
- Changing data schema or migrations.
- Enabling Google Sync, Arrange, notifications, ManageBac subscription, or public release surfaces.
- Tag, push, merge, publish, deploy, upload, submit, or Chrome Web Store actions.
- Declaring release readiness.

## Acceptance Criteria

Completion requires:

- Findings are grouped by severity.
- Each finding includes file/path reference, impact, evidence, and recommended next action.
- Audit explicitly checks current MVP out-of-scope surfaces.
- Audit explicitly checks data model/schema consistency risks.
- Audit explicitly lists test coverage gaps.
- Audit distinguishes must-fix-before-next-development from can-defer.
- No code or test files are modified.

## Required Evidence

The receiver must output:

- audit scope
- commands run, if any
- code findings by severity
- data model findings
- test coverage findings
- legacy/dead code findings
- out-of-scope surface findings
- recommended next actions
- confirmation that no product/test code was modified

## Open Questions

Questions requiring Product Owner decision:

- Any proposed fix, refactor, schema migration, or scope change must return to Product Owner / Product&Project Mg before implementation.

## Expected Deliverable

Return a concise Code Baseline Audit report to Product&Project Mg. Do not hand directly to releaseMg.
