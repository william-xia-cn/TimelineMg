# PROJECT_MASTER

## Project Status

- **Project**: TimeWhere
- **Version**: package / extension release version `0.3.2`; design-doc version `v2.3`
- **Stage**: WebDev architecture direction planning is active on branch `WebDev`; master is frozen for ordinary product feature development. Baseline Stabilized / desktop artifact history remains implementation history, but new product architecture work now follows D-046 Cloud-first / Web-first direction.
- **Active release/deployment target**: TimeWhere `0.2.3` CWS Private testing OAuth correction after the `0.2.2` Side Panel update exposed a CWS OAuth client mismatch.
- **Current constraint**: Google data sync v1 is approved as optional local-first cross-device sync. D-021 approves local task reminder notifications with Chrome `notifications` / `alarms`. D-025 approved the `0.2.1` Purple Potassium permission fix; D-026 records current source using Chrome Side Panel as the primary toolbar surface. D-027 approved the `0.2.2` Side Panel CWS update. D-029 approves the `0.2.3` CWS OAuth correction upload / Submit for Review and automatic publish after review. D-031 approves a standalone Windows Electron portable app with optional Chrome extension bridge, and D-032 replaces only its Desktop OAuth secret handling with PKCE plus bundled Desktop client metadata secret for the current internal desktop stage. Product Owner approved the `v0.3.0` desktop artifact candidate tag and moving that tag for the macOS Universal artifact correction only. Public listing expansion, deploy, CWS bridge submission, desktop signing/installer/auto-update, Google Calendar/Tasks integration, and background alarm automation for Arrange / ManageBac remain unapproved.

## Architecture Direction

- D-046 records the Product Owner direction that TimeWhere's target architecture is Cloud-first and Web-first: Cloud is the canonical data authority, Web Application is the primary business implementation, Desktop is a native Runtime, and Browser Extension is an ecosystem component.
- The direction proposal is recorded in `docs/ARCHITECTURE_DIRECTION_PROPOSAL_CLOUD_WEB_FIRST.md`.
- For this direction, Google is considered first as Google SSO / OIDC account identity. Google Drive Sync, Google Tasks, and Google Calendar integration are not part of the current direction document and require separate design.
- WebDev work should first produce Gap Analysis, target architecture, migration roadmap, and risk assessment before any implementation migration.
- Current WebDev architecture planning artifact: `docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md`.
- D-047 records WebDev v1 architecture defaults: Cloudflare Workers / D1 / R2 / KV / Pages, Google SSO only for account identity, full Web App coverage, retained offline read cache with offline edits blocked in v1, automatic migration after Google SSO, Browser Extension scope deferred, and Electron retained as the default Desktop Runtime.
- Current WebDev interface and migration planning artifacts: `docs/WEBDEV_INTERFACE_CONTRACTS.md`, `docs/WEBDEV_DATA_AUTHORITY_MATRIX.md`, and `docs/WEBDEV_AUTOMATIC_MIGRATION_PLAN.md`.
- Current WebDev Google SSO session lifecycle: Worker supports Google ID token login, account/profile lookup, editable TimeWhere workspace profile, safe `/account/status` runtime/gate diagnostics, local TimeWhere bearer refresh via `POST /auth/session/refresh`, and local session disconnect without revoking Google authorization or storing Google tokens.
- Current WebDev business parity tracking artifact: `docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md`.
- Current WebDev Web App business coverage is complete for local preview: Dashboard, Tasks, Calendar, Settings, Daily Settle projection, Reminder state, migration conflict review, structure editing, and Task-only pending diagnostics are covered by local implementation plus `npm run webdev:ui:walkthrough`; true preview cloud evidence is now in Phase 9 / Gate A execution with preview deployment, Google SSO smoke, preview foundation smoke, preview core Worker API smoke, and preview UI smoke completed against the stable Pages / Worker preview environment.
- Current Desktop Runtime repositioning is opt-in scaffolded: Electron can load the Web App via `TIMEWHERE_DESKTOP_RUNTIME_MODE=webdev` / `TIMEWHERE_WEB_APP_URL`, exposes only native bridge diagnostics/capabilities, has local `npm run webdev:desktop:smoke` evidence, and defaults to the legacy extension shell until Gate E packaging/distribution is approved.
- Current WebDev Phase 9 / Phase 10 acceptance artifacts: `docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md` defines Gate A preview evidence, preview risk register, and preview rollback/cleanup plan; `docs/WEBDEV_PROD_READINESS_CHECKLIST.md` plus `npm run webdev:prod:readiness` define Gate R prod readiness, release risk register, and rollback package requirements without approving deployment or release.
- Current WebDev future offline planning artifact: `docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md`. D-049 now allows a narrow Task-only queued pending path while keeping Task delete and non-Task offline writes blocked; broader replay remains gated by separate approvals.
- Current WebDev sync foundation: D1 `sync_changes`, Worker `/sync/bootstrap`, Worker `/sync/changes`, and repository change recording are scaffolded for local read-cache initialization, cursor-based incremental read-cache refresh, and future offline mutation replay; Pages can apply Cloud-confirmed changes into Task / Calendar / Structure / Settings caches while preserving local pending Task rows. User-facing Task create/update/complete/reopen can queue locally as pending while offline, but replay to Cloud remains disabled.
- Current WebDev offline queue foundation: Pages has Task-only queued pending enabled for create/update/complete/reopen when a Google SSO session exists; Task delete plus Calendar/Container/Settings offline writes still return `offline_write_blocked`. Pending Task rows are visibly marked, direct Cloud edit/delete actions are blocked until pending state is handled, and Settings provides retry preview / local discard controls.
- Current WebDev mutation replay foundation: Worker `/sync/mutations` validates mutation batches, exposes a Task-only replay activation gate plus field-level conflict preview, internal disabled transaction skeleton, internal dry-run diagnostics with non-persisted sanitized apply/conflict previews, and an internal readiness summary aggregating candidate counts / blocked reasons / preview counts; it persists metadata-only mutation outcomes, and Pages Settings can read sanitized replay diagnostics; replay remains disabled and does not apply user offline writes.
- Current Task-only replay enablement gate is documented in `docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md`: Product Owner approval requires scope lock, readiness evidence, conflict policy, UX semantics, test/safety bar, and explicit non-goals before any real replay write path. Worker `POST /sync/mutations/enablement-simulation` and the Settings preview card can evaluate Gate A-E inputs but remain `simulation_only` with `writes_enabled=false`.
- Current Task-only replay Phase 3 is implemented: Phase 2 client queued pending local writes cover Task create/update/complete/reopen; Phase 3 Settings review can handle one Task sync conflict at a time with `keep_cloud`, `discard_local`, or `later` metadata actions. Phase 1 server-side test-only replay remains internal.
- Current WebDev replay safety foundation: D1 `sync_conflicts`, Worker `/sync/conflicts`, and Pages Settings support single Task conflict review without local-over-cloud writes; `/sync/replay-safety` and Settings expose Phase 4 kill-switch / environment safety evidence with `writes_enabled=false`. Phase 5 adds a Pending Task queue panel with retry preview and local discard actions. Phase 6 records Calendar / Container / Settings replay design only; no non-Task replay implementation is approved. Phase 7 adds read-only cross-entity dependency analysis to replay readiness so ordering blockers are visible without enabling writes. Phase 8 hardens Task pending UX without expanding to full offline-first. Phase 9 adds preview readiness hardening with evidence gaps, dependency blockers, required evidence, and approval blockers. D-049 Phase 2-9 is complete; prod release, Calendar/Container/Settings replay implementation, Browser Extension replay, local-over-cloud overwrite, batch conflict handling, and full-entity offline-first still require separate approval.
- Cloudflare dev / preview / prod environments now have an initial scaffold under `workers/` and `pages/`. Gate A dev/preview resource creation is approved and dev/preview D1/R2/KV plus Pages projects have been created/confirmed; true resource ids are stored only in ignored `.wrangler/` local state. Preview Worker and stable Pages preview deploy are live for internal Gate A verification; Google SSO smoke passes on the stable preview origin; `npm run webdev:preview:headers-smoke` verifies stable preview CSP/security headers, root HTML no-store, and hashed asset immutable cache; `npm run webdev:preview:smoke` verifies preview Worker / Pages / D1 / R2 / KV without touching prod; `npm run webdev:preview:core-smoke` verifies preview Account / Structure / Task / Calendar / Settings / Sync / Migration API paths through a temporary smoke account and cleans it up; `npm run webdev:preview:ui-smoke` verifies stable Pages preview UI can read preview Worker data for Dashboard / Tasks / Calendar / Settings through a temporary smoke account and cleans it up. `pages/public/_headers` defines Cloudflare Pages CSP, security response headers, immutable asset cache, and `/` / `index.html` no-store for preview/prod readiness. Local `npm run webdev:verify`, `npm run webdev:ui:walkthrough`, `npm run webdev:desktop:smoke`, `npm test`, `git diff --check`, sensitive pattern scan, and `npm run webdev:prod:readiness` pass as Phase 9/10 supporting evidence. Prod deploy/release remains unapproved.

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
- IndexedDB / Dexie v5 data model.
- Task Board basic CRUD.
- Calendar containers/events basic management.
- Focus Dashboard.
- Daily Settle.
- Minimal Settings.
- Minimal Popup.
- Chrome Side Panel as the primary toolbar surface.
- `scheduling.js` unit tests.
- Manual MVP validation checklist.
- Google data sync v1 per D-019 / D-020: optional account configuration for cloud persistence and cross-device bidirectional sync; TimeWhere remains fully usable without Google.
- System task reminders per D-021: local Chrome notifications for explicit `schedule_time` tasks and current Daily Settle container tasks.
- Windows desktop portable implementation per D-031/D-032: Electron desktop shell, Windows portable package target, desktop Google Drive `appDataFolder` sync path with bundled Desktop OAuth client ID and artifact-bundled Desktop client metadata secret, app-running desktop notifications, and optional Chrome extension bridge.

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
- Desktop signing, installer, auto-update, Swift/Tauri rewrites, SQLite migration, duplicated UI, silent Google account binding / cloud restore, or treating Chrome extension connection as required for Windows app use.

## Release / Deployment State

| Item | Status |
|---|---|
| Candidate version | `0.2.3` CWS Private OAuth correction |
| Candidate commit | `03a979f` |
| Package/artifact | `dist/TimeWhere-0.2.3-private-cws-sanitized-20260524-041047.zip` |
| Artifact hash | `F51880F8BE68A6B607B586EB58D1871D2F5DA06580F2E9387BABB122FCBBDA1B` |
| Deployment channel | Chrome Web Store Private testing |
| Review status | `0.2.3` OAuth correction was submitted to CWS review on 2026-05-24 after canceling the pending `0.2.2` draft review; automatic publish after review was enabled. CWS status verified as `待审核`; do not claim publication until CWS accepts it. |
| Public release | NOT_STARTED; explicitly out of MVP scope |
| Tag | NOT_APPROVED for the CWS `0.2.3` candidate |

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
| Google data sync scope creep | OPEN | Product&Project Mg / Build&Test | D-019/D-020 approve optional Drive `appDataFolder` bidirectional sync only. Do not turn Google account into a product login requirement; local IndexedDB remains the runtime source of truth. Chrome / Desktop Google Sync runtime alignment is governed by D-045 and must preserve platform auth/storage boundaries. |
| `0.2.1` stabilization scope | OPEN | Build&Test | Current sync includes Task Arrange same-day subject matching, no-throttle page-open Arrange apply, Calendar/Plan Arrange diagnostic snapshots, MatrixView Subject ID inheritance/backfill, Daily Settle display model, Dashboard/Popup task UI, readable Google Sync conflicts, and documentation/version updates. No `0.2.1` CWS package was generated. |
| CWS Purple Potassium `tabs` permission finding | PUBLISHED | releaseMg / Product Owner | `tabs` permission removed from source and CWS package; fixed `0.2.1` Private testing package was accepted and published before the `0.2.2` Side Panel update submission. |
| CWS/source drift after submission | CLOSED | Product Owner / Build&Test / releaseMg | Current Side Panel / quick-add source was bumped to `0.2.2`, regenerated as a sanitized CWS package, uploaded, and submitted to CWS review with `sidePanel` permission/privacy disclosure. |
| CWS OAuth client mismatch | SUBMITTED TO CWS REVIEW | Product Owner / releaseMg | CWS package strips manifest `key`, so the CWS installed extension uses store ID `bokjekfjghliieopghopibmhjokgkjkb` rather than the fixed development ID. Product Owner authorized the `0.2.3` OAuth correction upload / Submit for Review; CWS status is `待审核` with automatic publish after review enabled. |

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
- CWS Private `0.2.3` OAuth correction local package preparation:
  - `dist/TimeWhere-0.2.3-private-cws-sanitized-20260524-041047.zip`
  - SHA256 `F51880F8BE68A6B607B586EB58D1871D2F5DA06580F2E9387BABB122FCBBDA1B`
  - Zip inspection: manifest version `0.2.3`, `key` absent, `tabs` absent, CWS OAuth client ID present, Drive `appDataFolder` scope unchanged.
  - CWS dashboard: pending `0.2.2` draft review canceled; `0.2.3` package uploaded; draft version `0.2.3` confirmed with expected permissions and no `tabs`; Submit for Review completed; automatic publish after review checkbox was checked; final status verified as `待审核`.
- Trusted tester local unpacked `0.2.3` package preparation:
  - `dist/TimeWhere-0.2.3-local-unpacked-20260524-042303.zip`
  - SHA256 `6FEAFDB4C7072FFA1336F8BDA656CEDE2B0242F2D00D93D5B117C8ACBE5C23DF`
  - Zip inspection: root contains only `extension/`; manifest version `0.2.3`; `key` present; development OAuth client ID present; Drive `appDataFolder` scope unchanged.
- `0.2.1` stabilization sync evidence:
  - Full `npm test` passed on 2026-05-20 after Task Arrange same-day subject matching, no-throttle auto Arrange, and Calendar/Plan diagnostic snapshot changes.
  - No `0.2.1` package or CWS submission artifact was generated.
- D-030 / D-031 desktop preparation evidence:
  - `docs/specs/FEATURE_SPEC_DUAL_PLATFORM_EVOLUTION.md`
  - `docs/PLATFORM_BOUNDARY.md`
  - `extension/shared/js/platform.js`
  - `platforms/desktop-electron/`
  - `tests/platform-boundary.test.js`
  - `npm test` passed after adding reinstall recovery UX, platform auth adapter, and Electron preview.
  - Electron dependency is pinned by `platforms/desktop-electron/package-lock.json`; `electron@42.3.2` reports `npm audit --audit-level=high` with `0 vulnerabilities` when verified.
  - Windows portable target generated: `platforms/desktop-electron/dist/TimeWhere-0.2.3-win-portable.exe`; SHA256 `B16EC9B7D5A37B2E62B6E85DC33CDE8366FE11481E3308EF52CEC2FFB6F75627`.
  - Superseded desktop artifact candidate: `0.3.0` macOS x64 zip from workflow artifact `TimeWhere-mac-package`; SHA256 `9014E7CE2755418662270847A1F8100F15AF592681D83A36BCE48C45109B9CC6`. Superseded because Product Owner selected Universal as the `0.3.0` macOS artifact target.
  - Current desktop artifact target: `0.3.2` Windows portable exe and macOS Universal zip using the existing unsigned package targets.
  - `0.3.0` Windows portable target generated: `platforms/desktop-electron/dist/TimeWhere-0.3.0-win-portable.exe`; SHA256 `28CF9906B35821505B77A56470942BC7D1A55BD9506FA47784B8ED029EAA3E57`.
  - `0.3.0` macOS Universal target generated by GitHub Actions run `27007833745`: `TimeWhere-0.3.0-mac-universal.zip`; SHA256 `0541F177DFB5754C5145BC65582A08D5ED0A533F4FC24A01F92219DE14410A4E`.
  - Verification: `npm --prefix platforms/desktop-electron audit --audit-level=high`, `npm run electron:smoke`, portable exe smoke with `TIMEWHERE_ELECTRON_SMOKE=1`, `npm run electron:package:win`, and `npm test` passed on 2026-06-04. Bundled Desktop OAuth / post-authorization failure handling / local Desktop OAuth diagnostics re-verified with `node tests/google-sync.test.js`, `node tests/platform-boundary.test.js`, `npm run electron:smoke`, `npm run electron:package:win`, portable exe smoke, and `npm test` on 2026-06-05.
  - Universal artifact correction verification on 2026-06-05: `npm test`, `npm run electron:smoke`, `node tests/platform-boundary.test.js`, `npm run electron:package:win`, and GitHub Actions macOS workflow run `27007833745` passed. Windows-side zip inspection confirmed `TimeWhere.app` is present; `lipo` architecture verification remains macOS-side verification because the current local environment is Windows.
  - Desktop OAuth client ID is tracked in source; Desktop client metadata secret is generated into a gitignored `platforms/desktop-electron/desktop-oauth-secrets.js` before internal desktop packaging and bundled into the artifact. `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID` remains an optional override for testing or client rotation. The full secret value must not be committed or repeated in repository docs, release evidence, tests, logs, or user-facing diagnostics.
  - `v0.3.0` desktop artifact candidate tag was moved to the corrected macOS Universal candidate commit; public release, GitHub Release creation, desktop signing, installer, auto-update, CWS bridge submission, deploy, and release remain unapproved.

## Product Owner Decisions Needed

1. Confirm Product Owner name or preferred authority label.
2. Confirm final CWS review / publish outcome for the `0.2.3` OAuth correction.
3. Run real Google data sync smoke after CWS accepts/publishes `0.2.3`.
4. Decide whether a separate later Side Panel / quick-add follow-up is still needed after `0.2.3` resolves the OAuth client mismatch.
