# PROJECT_MASTER

## Project Status

- **Project**: TimeWhere
- **Version**: package / extension release version `0.2.2`; design-doc version `v2.3`
- **Stage**: Baseline Stabilized; CWS Private testing Side Panel update in progress
- **Active release/deployment target**: TimeWhere `0.2.2` CWS Private testing Side Panel / quick-add update after the accepted `0.2.1` Private testing package was published.
- **Current constraint**: Google data sync v1 is approved as optional local-first cross-device sync. D-021 approves local task reminder notifications with Chrome `notifications` / `alarms`. D-025 approved the `0.2.1` Purple Potassium permission fix; D-026 records current source using Chrome Side Panel as the primary toolbar surface. D-027 approves publishing the accepted `0.2.1` Private testing package, bumping Side Panel source/package to `0.2.2`, uploading the sanitized CWS package, submitting it for review, and enabling automatic publish after review. Public listing expansion, tag, merge, deploy, Google Calendar/Tasks integration, and background alarm automation for Arrange / ManageBac remain unapproved.

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
- Background alarm based Arrange automation. Current Task Date Arrange is page-open automation only for Dashboard / Focus, Planner / Task Board, and Calendar; it has no six-hour throttle and may directly apply eligible local scheduling updates. It does not run from Popup or background alarms.
- Automatic priority downgrade; current Task Date Arrange may only upgrade priority according to D-024.
- Defense / squeezing rules.
- Background alarm usage outside local task reminders. D-021 approves alarms only for local task reminder notifications.
- Background alarm based ManageBac ICS subscription sync. Current ManageBac follow-up supports saved link configuration, Dashboard-entry management checks, manual sync, and user-confirmed task creation only.
- Any further Chrome Web Store upload, Submit for Review, publish, or public listing without explicit Product Owner approval. D-025 covered only the completed `0.2.1` Purple Potassium resubmission; current source has moved ahead of that submitted package.

## Release / Deployment State

| Item | Status |
|---|---|
| Candidate version | `0.2.2` CWS Private Side Panel update |
| Candidate commit | `03a979f` |
| Package/artifact | `dist/TimeWhere-0.2.2-private-cws-sanitized-20260523-224444.zip` |
| Artifact hash | `486AFF60126AD5E0C38AD1A7102EC0F5DA4D641BD672BEE7C8A1D1479ADBC612` |
| Deployment channel | Chrome Web Store Private testing |
| Review status | Accepted `0.2.1` Private testing package was published to Private testers; `0.2.2` Side Panel update was submitted to CWS review with automatic publish after review enabled |
| Public release | NOT_STARTED; explicitly out of MVP scope |
| Tag | NOT_APPROVED |

## Known Risks

| Risk | State | Owner | Notes |
|---|---|---|---|
| Import source mismatch | CLOSED | Product Owner | Product Owner accepted `_imports/governance-template/README.md` and `MIGRATION_GUIDE.md` as partial equivalents for missing `EXPORT_README.md` and `SOURCE_INVENTORY.md`. |
| Public release confusion | OPEN | Product&Project Mg / Build&Test / releaseMg | Internal MVP acceptance is approved, but public release, Chrome Web Store submission, tag, push, merge, deploy, publish, upload, and submit remain explicitly unapproved. |
| Candidate source traceability | CLOSED | releaseMg | Latest `0.2.0` CWS Private artifact was regenerated from clean HEAD `753ac44`. |
| Test waiver for regenerated package | OPEN | Product Owner / releaseMg | Product Owner instructed releaseMg to regenerate release/CWS materials without tests. Do not treat this as tested release evidence. |
| CWS manifest key stripping | OPEN | Product Owner / Build&Test / releaseMg | Chrome Web Store rejected packages containing manifest `key`. The current CWS sanitized artifact strips `key` from the package copy only; if CWS assigns a different extension ID, Google OAuth client configuration must be updated for Drive sync before live sync validation. |
| Container id documentation mismatch | DECIDED / DOCS PENDING | Product&Project Mg / Build&Test | Product Owner approved string UUID ids for tasks, containers, events, and habits; planner helper records may remain numeric for now. Docs still need cleanup. |
| Baseline unknowns after pre-governance development | TRIAGED | Product&Project Mg / Build&Test | Read-only code/docs audits are complete. Phase 1 corrective package is approved and ready for Build&Test. |
| Popup half-implemented task actions | CLOSED | Product&Project Mg | Build&Test implemented DB-backed Popup start/defer behavior; Product&Project Mg review passed; releaseMg narrow recheck returned PASS. |
| Daily Settle task-pool inconsistency | CLOSED | Product&Project Mg | Build&Test centralized task-pool filtering with `TimeWhereScheduling.buildDailyTaskPool()`; Product&Project Mg review passed; releaseMg narrow recheck returned PASS. |
| Phase 2A safety hardening | CLOSED | Product&Project Mg | Build&Test completed Phase 2A; Product&Project Mg review passed; releaseMg narrow recheck returned PASS_WITH_MANUAL_EVIDENCE. |
| Documentation baseline drift | CLOSED | Product&Project Mg | Product docs now distinguish current local-first MVP baseline from future/out-of-scope Google Sync, Arrange, notifications, ManageBac, CWS, and public release work. |
| Google data sync scope creep | OPEN | Product&Project Mg / Build&Test | D-019/D-020 approve optional Drive `appDataFolder` bidirectional sync only. Do not turn Google account into a product login requirement; local IndexedDB remains the runtime source of truth. |
| `0.2.1` stabilization scope | OPEN | Build&Test | Current sync includes Task Arrange same-day subject matching, no-throttle page-open Arrange apply, Calendar/Plan Arrange diagnostic snapshots, MatrixView Subject ID inheritance/backfill, Daily Settle display model, Dashboard/Popup task UI, readable Google Sync conflicts, and documentation/version updates. No `0.2.1` CWS package was generated. |
| CWS Purple Potassium `tabs` permission finding | PUBLISHED | releaseMg / Product Owner | `tabs` permission removed from source and CWS package; fixed `0.2.1` Private testing package was accepted and published before the `0.2.2` Side Panel update submission. |
| CWS/source drift after submission | CLOSED | Product Owner / Build&Test / releaseMg | Current Side Panel / quick-add source was bumped to `0.2.2`, regenerated as a sanitized CWS package, uploaded, and submitted to CWS review with `sidePanel` permission/privacy disclosure. |

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
- CWS Private `0.2.1` Purple Potassium policy-fix resubmission:
  - `docs/release/RELEASE_GATE_REPORT_CWS_PRIVATE_0.2.1_2026-05-20.md`
  - `docs/release/CWS_PRIVATE_SUBMISSION_MATERIALS_0.2.1_2026-05-20.md`
  - `dist/TimeWhere-0.2.1-private-cws-sanitized-20260520-214913.zip`
- `0.2.1` stabilization sync evidence:
  - Full `npm test` passed on 2026-05-20 after Task Arrange same-day subject matching, no-throttle auto Arrange, and Calendar/Plan diagnostic snapshot changes.
  - No `0.2.1` package or CWS submission artifact was generated.

## Product Owner Decisions Needed

1. Confirm Product Owner name or preferred authority label.
2. Confirm final CWS review outcome after `0.2.1` Purple Potassium fix resubmission.
3. Decide whether and when to approve automatic publish or manual staged publish after review.
4. Decide whether Side Panel / quick-add changes should be packaged for a later CWS update after the current pending review resolves.
