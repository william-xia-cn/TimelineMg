# PROJECT_MASTER

## Project Status

- **Project**: TimeWhere
- **Version**: package / extension release version `0.2.0`; design-doc version `v2.3`
- **Stage**: Baseline Stabilized; Chrome Web Store Private testing material preparation under D-023
- **Active release/deployment target**: Prepare TimeWhere `0.2.0` Chrome Web Store Private testing submission materials and releaseMg readiness evidence. Internal MVP acceptance, Phase 1, Phase 2A, and documentation baseline cleanup are complete.
- **Current constraint**: Google data sync v1 is approved as optional local-first cross-device sync. D-021 approves local task reminder notifications with Chrome `notifications` / `alarms`. D-023 approves CWS Private testing material preparation for `0.2.0` only. Actual Chrome Web Store upload, Submit for Review, publish, public listing, tag, merge, deploy, push, release, Google Calendar/Tasks integration, and background alarm automation for Arrange / ManageBac remain unapproved.

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
- Google data sync v1 per D-019 / D-020: optional account configuration for cloud persistence and cross-device bidirectional sync; TimeWhere remains fully usable without Google.
- System task reminders per D-021: local Chrome notifications for explicit `schedule_time` tasks and current Daily Settle container tasks.

### Out Of Scope

- Release, publish, Chrome Web Store upload, Submit for Review, release/artifact upload, deploy, merge, push, tag, or submit actions without explicit Product Owner approval.
- Recording secrets, OAuth client secrets, cookies, tokens, private account data, or private user identifiers in repository documents.
- Changing product scope, data model, sync behavior, privacy posture, or release standards without Product Owner decision.
- Google Calendar / Google Tasks integration; Google data sync v1 uses Drive `appDataFolder` only.
- Background alarm based Arrange automation; current Task Date Arrange is checked from Dashboard entry only, previews changes, and writes only through the unified management confirmation page after user confirmation.
- Automatic priority downgrade; current Task Date Arrange may only upgrade priority according to D-017.
- Defense / squeezing rules.
- Background alarm usage outside local task reminders. D-021 approves alarms only for local task reminder notifications.
- Background alarm based ManageBac ICS subscription sync. Current ManageBac follow-up supports saved link configuration, Dashboard-entry management checks, manual sync, and user-confirmed task creation only.
- Actual Chrome Web Store upload, Submit for Review, publish, or public listing. D-023 approves Private testing material preparation only.

## Release / Deployment State

| Item | Status |
|---|---|
| Candidate version | `0.2.0` |
| Candidate commit | `6a95c88` plus uncommitted working-tree changes; source metadata commit pending before any CWS upload/submit |
| Package/artifact | `dist/TimeWhere-0.2.0-private-cws-20260518-011449.zip` |
| Artifact hash | SHA256 `62DCB492E94CC0D20E6BB690906A4246024C9741D6FC049766CC5AE6780F95BF` |
| Deployment channel | Chrome Web Store Private testing material preparation |
| Review status | releaseMg CWS Private readiness evidence prepared; Product Owner decision still required |
| Public release | NOT_STARTED; explicitly out of MVP scope |
| Tag | NOT_APPROVED |

## Known Risks

| Risk | State | Owner | Notes |
|---|---|---|---|
| Import source mismatch | CLOSED | Product Owner | Product Owner accepted `_imports/governance-template/README.md` and `MIGRATION_GUIDE.md` as partial equivalents for missing `EXPORT_README.md` and `SOURCE_INVENTORY.md`. |
| Public release confusion | OPEN | Product&Project Mg / Build&Test / releaseMg | Internal MVP acceptance is approved, but public release, Chrome Web Store submission, tag, push, merge, deploy, publish, upload, and submit remain explicitly unapproved. |
| Candidate source traceability | OPEN | Product Owner / Build&Test / releaseMg | `0.2.0` CWS Private artifact was generated from a dirty working tree. Before any CWS upload/submit, Product Owner should approve the commit/staging path or explicitly accept this local-source traceability risk. |
| Container id documentation mismatch | DECIDED / DOCS PENDING | Product&Project Mg / Build&Test | Product Owner approved string UUID ids for tasks, containers, events, and habits; planner helper records may remain numeric for now. Docs still need cleanup. |
| Baseline unknowns after pre-governance development | TRIAGED | Product&Project Mg / Build&Test | Read-only code/docs audits are complete. Phase 1 corrective package is approved and ready for Build&Test. |
| Popup half-implemented task actions | CLOSED | Product&Project Mg | Build&Test implemented DB-backed Popup start/defer behavior; Product&Project Mg review passed; releaseMg narrow recheck returned PASS. |
| Daily Settle task-pool inconsistency | CLOSED | Product&Project Mg | Build&Test centralized task-pool filtering with `TimeWhereScheduling.buildDailyTaskPool()`; Product&Project Mg review passed; releaseMg narrow recheck returned PASS. |
| Phase 2A safety hardening | CLOSED | Product&Project Mg | Build&Test completed Phase 2A; Product&Project Mg review passed; releaseMg narrow recheck returned PASS_WITH_MANUAL_EVIDENCE. |
| Documentation baseline drift | CLOSED | Product&Project Mg | Product docs now distinguish current local-first MVP baseline from future/out-of-scope Google Sync, Arrange, notifications, ManageBac, CWS, and public release work. |
| Google data sync scope creep | OPEN | Product&Project Mg / Build&Test | D-019/D-020 approve optional Drive `appDataFolder` bidirectional sync only. Do not turn Google account into a product login requirement; local IndexedDB remains the runtime source of truth. |

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
- CWS Private testing material preparation:
  - `docs/release/RELEASE_GATE_REPORT_CWS_PRIVATE_0.2.0_2026-05-18.md`
  - `docs/release/CWS_PRIVATE_SUBMISSION_MATERIALS_0.2.0_2026-05-18.md`
  - `docs/release/cws-assets/0.2.0-private/`

## Product Owner Decisions Needed

1. Confirm Product Owner name or preferred authority label.
2. Decide whether to approve CWS Developer Dashboard upload / Submit for Review for the `0.2.0` Private testing candidate.
3. Approve the branch/stage/commit sequence for the dirty working tree before any CWS upload/submit, or explicitly accept the local-source traceability risk.
