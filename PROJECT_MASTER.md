# PROJECT_MASTER

## Project Status

- **Project**: TimeWhere
- **Version**: package / extension release version `0.1.0`; design-doc version `v2.3`
- **Stage**: Baseline Stabilized; awaiting next Product Owner planning
- **Active release/deployment target**: Internal MVP acceptance approved by Product Owner; Phase 1, Phase 2A, and documentation baseline cleanup are complete.
- **Current constraint**: No new product code/test work, public release, tag, push, merge, deploy, publish, upload, submit, or Chrome Web Store submission is approved until Product Owner chooses the next work package.

## Collaboration Model

- **Status**: Lightweight three-role collaboration baseline established and confirmed by Product Owner.
- **Project type**: Personal Chrome extension project.
- **Default process**: lightweight, traceable, and proportional to risk.

Roles:

- `Product&Project Mg`: requirements, specs, planning, acceptance criteria, implementation conformance review; docs-only by default.
- `Build&Test`: implementation, unit/integration tests, implementation evidence.
- `releaseMg`: acceptance, release/deployment gates, readiness recommendation; does not fix bugs or replace Product Owner.

Hard rule:

```text
Important facts do not move by memory.
Use PROJECT_MASTER.md / TASK_BOARD.md / DECISIONS.md and concise result summaries.
Use formal handoffs only for cross-session, release, privacy/security, high-risk, or Product Owner-requested work.
```

## Governance Entry Points

- **Workflow**: `PROJECT_WORKFLOW.md`
- **Agent rules**: `AGENTS.md`
- **Role contracts**:
  - `docs/agents/ProductProjectMg.md`
  - `docs/agents/BuildTest.md`
  - `docs/agents/ReleaseMg.md`
- **Handoff template**: `docs/handoffs/HANDOFF_TEMPLATE.md`
- **Feature spec template**: `docs/specs/FEATURE_SPEC_TEMPLATE.md`
- **Release templates**:
  - `docs/release/RELEASE_CHECKLIST.md`
  - `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`

## External Advisor Position

ChatGPT or external advisor is the Product Owner's architecture reviewer and decision-support partner.

It does not own daily project scheduling, routine bugfixes, every-session prompts, routine test-failure debugging, implementation details, release step-by-step operation, or daily task-board maintenance.

Escalate to external advisor for:

- product model changes;
- architecture uncertainty;
- storage/sync/statistics/security/privacy/permission model changes;
- release blocker disputes;
- role conflict;
- suspected agent scope violation;
- Product Owner second opinion.

## Current Scope

### In Scope

- Local-first MVP for IB student personal time management.
- IndexedDB / Dexie v4 data model.
- Task Board basic CRUD.
- Calendar containers/events basic management.
- Focus Dashboard.
- Daily Settle.
- Minimal Settings.
- Minimal Popup.
- `scheduling.js` unit tests.
- Manual MVP validation checklist.

### Out Of Scope

- Release, publish, upload, deploy, merge, tag, or submit actions without explicit Product Owner approval.
- Recording secrets, OAuth client secrets, cookies, tokens, private account data, or private user identifiers in repository documents.
- Changing product scope, data model, sync behavior, privacy posture, or release standards without Product Owner decision.
- Google Sync implementation.
- Arrange timetable advancement.
- Automatic priority promotion.
- Defense / squeezing rules.
- Reminder notification system.
- ManageBac ICS subscription.
- Chrome Web Store submission.

## Release / Deployment State

| Item | Status |
|---|---|
| Candidate version | `0.1.0` |
| Candidate commit | Not confirmed |
| Package/artifact | N/A |
| Artifact hash | N/A |
| Deployment channel | Internal MVP acceptance |
| Review status | Internal MVP acceptance approved by Product Owner |
| Public release | NOT_STARTED; explicitly out of MVP scope |
| Tag | NOT_APPROVED |

## Known Risks

| Risk | State | Owner | Notes |
|---|---|---|---|
| Import source mismatch | CLOSED | Product Owner | Product Owner accepted `_imports/governance-template/README.md` and `MIGRATION_GUIDE.md` as partial equivalents for missing `EXPORT_README.md` and `SOURCE_INVENTORY.md`. |
| Public release confusion | OPEN | Product&Project Mg / Build&Test / releaseMg | Internal MVP acceptance is approved, but public release, Chrome Web Store submission, tag, push, merge, deploy, publish, upload, and submit remain explicitly unapproved. |
| Container id documentation mismatch | DECIDED / DOCS PENDING | Product&Project Mg / Build&Test | Product Owner approved string UUID ids for tasks, containers, events, and habits; planner helper records may remain numeric for now. Docs still need cleanup. |
| Baseline unknowns after pre-governance development | TRIAGED | Product&Project Mg / Build&Test | Read-only code/docs audits are complete. Phase 1 corrective package is approved and ready for Build&Test. |
| Popup half-implemented task actions | CLOSED | Product&Project Mg | Build&Test implemented DB-backed Popup start/defer behavior; Product&Project Mg review passed; releaseMg narrow recheck returned PASS. |
| Daily Settle task-pool inconsistency | CLOSED | Product&Project Mg | Build&Test centralized task-pool filtering with `TimeWhereScheduling.buildDailyTaskPool()`; Product&Project Mg review passed; releaseMg narrow recheck returned PASS. |
| Phase 2A safety hardening | CLOSED | Product&Project Mg | Build&Test completed Phase 2A; Product&Project Mg review passed; releaseMg narrow recheck returned PASS_WITH_MANUAL_EVIDENCE. |
| Documentation baseline drift | CLOSED | Product&Project Mg | Product docs now distinguish current local-first MVP baseline from future/out-of-scope Google Sync, Arrange, notifications, ManageBac, CWS, and public release work. |

## Current Evidence

- Governance template read from `_imports/governance-template/README.md`, `MIGRATION_GUIDE.md`, root `*_TEMPLATE.md` files, and referenced role/template files under `_imports/governance-template/docs/`.
- Existing project facts sampled from `package.json`, `docs/ARCHITECTURE.md`, `docs/DESIGN_v2.0.md`, and `docs/DEPLOY.md`.
- Internal MVP acceptance evidence:
  - `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
  - `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_RECHECK_2026-05-12.md`
  - `docs/handoffs/outbox/REVIEW-BUILDMVP-001.md`
  - `docs/handoffs/outbox/REVIEW-BLOCKER-REL-MVP-001.md`
- Baseline audit handoffs:
  - `docs/handoffs/outbox/HANDOFF-CODE-AUDIT-001.md`
  - `docs/handoffs/outbox/HANDOFF-DOCS-AUDIT-001.md`
- Baseline audit results:
  - `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`
  - `docs/handoffs/outbox/REVIEW-DOCS-AUDIT-001.md`
  - `docs/handoffs/outbox/BASELINE-ACTION-PLAN-001.md`
- Active implementation handoff:
  - `docs/handoffs/outbox/HANDOFF-BASELINE-P1-001.md`
- Phase 1 review / recheck:
  - `docs/handoffs/outbox/REVIEW-BASELINE-P1-001.md`
  - `docs/handoffs/outbox/HANDOFF-RELEASE-BASELINE-P1-RECHECK-001.md`
  - `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P1-RECHECK-001.md`
- Active Phase 2A handoff:
  - `docs/handoffs/outbox/HANDOFF-BASELINE-P2A-SAFETY-001.md`
- Phase 2A review / recheck:
  - `docs/handoffs/outbox/REVIEW-BASELINE-P2A-SAFETY-001.md`
  - `docs/handoffs/outbox/HANDOFF-RELEASE-BASELINE-P2A-RECHECK-001.md`
  - `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P2A-RECHECK-001.md`
- Active documentation cleanup:
  - `docs/handoffs/outbox/HANDOFF-DOCS-BASELINE-CLEANUP-001.md`
  - `docs/handoffs/outbox/REVIEW-DOCS-BASELINE-CLEANUP-001.md`

## Product Owner Decisions Needed

1. Confirm Product Owner name or preferred authority label.
2. Select the next product, acceptance, or git/version-control work package.
3. If committing the baseline, approve the branch/stage/commit sequence in `docs/handoffs/outbox/GIT-HYGIENE-COMMIT-PLAN-001.md`.
