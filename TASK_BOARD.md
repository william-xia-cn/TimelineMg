# TASK_BOARD

## Active Target

- WebDev architecture direction planning is now active under D-046. The Product Owner direction is Cloud-first / Web-first: Cloud becomes canonical data authority, Web Application becomes the primary business implementation, Desktop becomes a Runtime, and Browser Extension becomes an ecosystem component. This is not an implementation migration approval.
- D-047 records WebDev v1 architecture defaults: Cloudflare Workers / D1 / R2 / KV / Pages, Google SSO account identity, full Web App implementation, retained offline read cache with offline edits blocked in v1, automatic migration after Google SSO, deferred Browser Extension scope, and Electron as default Desktop Runtime.
- Baseline Stabilized; package / extension version is moving to `0.3.2` for desktop artifact preparation. The historical `0.2.3` CWS Private testing OAuth correction remains submitted to CWS review after Google sync failed with a bad OAuth client ID.
- D-031/D-032 Windows desktop portable implementation is active for local testing and now uses a bundled Desktop OAuth client ID plus artifact-bundled Desktop client metadata secret generated from ignored packaging input. Current desktop artifact target is `0.3.2` Windows portable exe plus macOS Universal zip using existing unsigned package targets.
- Internal MVP acceptance, Phase 1 corrective work, Phase 2A safety hardening, documentation baseline cleanup, TimeWhere `0.2.0` CWS Private testing material preparation, the accepted `0.2.1` Purple Potassium Private testing publication, `0.2.2` Side Panel CWS submission, `0.2.3` OAuth correction CWS submission, and D-031 Windows desktop portable implementation are complete. Product Owner approved the `v0.3.0` desktop artifact candidate tag and moving that tag for the macOS Universal artifact correction only. Public listing expansion / CWS bridge submission / desktop signing or installer / deploy remain unapproved.

## Active Collaboration Model

- [x] Three-role Codex workflow established.
  - `Product&Project Mg`: spec / plan / acceptance criteria / implementation review.
  - `Build&Test`: implementation / unit and integration tests / evidence.
  - `releaseMg`: acceptance / release gate / readiness recommendation.
  - Mandatory role contracts:
    - `docs/agents/ProductProjectMg.md`
    - `docs/agents/BuildTest.md`
    - `docs/agents/ReleaseMg.md`
  - Formal handoff only when scope, permission, release evidence, privacy/security, or cross-session boundaries require durable tracking.
- [x] Workflow simplification adopted.
  - Small routine work: no default spec / handoff / audit / release report.
  - Medium work: concise spec/result/test/risk evidence.
  - Release/high-risk work: checklist/readiness/blocker table where useful.
- [x] External advisor role defined.
  - Advisor: architecture review / decision support.
  - Not daily scheduler or routine implementation manager.

## NOW

- [x] Import governance template into new project documents.
- [x] Product Owner confirms governance mode, active release target, version naming, and current scope.
- [x] releaseMg regenerated TimeWhere `0.2.0` Chrome Web Store Private testing package/materials from latest clean HEAD `753ac44` under D-023. Tests were not run per Product Owner instruction. CWS upload package was sanitized to remove manifest `key`.
- [x] Build&Test prepared `0.2.1` stabilization code/docs sync with full `npm test` passing; no `0.2.1` CWS package generated.
- [x] releaseMg prepared `0.2.1` Purple Potassium policy-fix CWS package: removed unnecessary `tabs` permission, regenerated sanitized zip, and passed lightweight verification.
- [x] releaseMg submitted the fixed `0.2.1` package to CWS review and verified dashboard status as pending review; automatic publish after review remains disabled/unapproved.
- [x] Documentation aligned to current Side Panel / Dashboard quick-add source state and recorded source drift from the pending CWS package.
- [x] releaseMg canceled the pending `0.2.2` CWS draft review, uploaded `dist/TimeWhere-0.2.3-private-cws-sanitized-20260524-041047.zip`, confirmed draft version `0.2.3` with expected permissions and no `tabs`, submitted it for review, and verified CWS status `待审核` with automatic publish after review enabled.
- [x] Build&Test implemented D-030 dual-platform preparation: platform boundary/spec docs, reinstall recovery UX, lightweight Chrome platform adapter, platform auth adapter for Google Sync, and Mac Electron preview skeleton. D-031 now supersedes the Mac preview target with Windows desktop portable scope.
- [x] Build&Test implemented D-031 Windows desktop portable app: desktop Electron shell, bundled Desktop OAuth client ID with optional env override, desktop notifications, optional Chrome extension bridge, and portable exe package `platforms/desktop-electron/dist/TimeWhere-0.2.3-win-portable.exe`.
- [x] Build&Test bumped current package / extension / desktop artifact target to `0.3.0` and generated Windows portable exe `platforms/desktop-electron/dist/TimeWhere-0.3.0-win-portable.exe` with SHA256 `28CF9906B35821505B77A56470942BC7D1A55BD9506FA47784B8ED029EAA3E57`.
- [x] Build&Test corrected the `0.3.0` macOS artifact target from superseded x64 zip to Universal zip, generated GitHub Actions artifact `TimeWhere-0.3.0-mac-universal.zip` with SHA256 `0541F177DFB5754C5145BC65582A08D5ED0A533F4FC24A01F92219DE14410A4E`, and moved `v0.3.0` to the corrected candidate commit.
- [x] Build&Test fixed Windows desktop Google authorization post-callback failure handling: stale/unreadable saved token state is cleared before re-authorization, structured OAuth failure reasons reach Settings, and first failed authorization keeps the connect button available.
- [x] Build&Test replaced PKCE-only Desktop OAuth with PKCE plus artifact-bundled Desktop client metadata secret for the default Desktop client; `desktop-oauth.local.json` and `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET` are packaging inputs only, not ordinary runtime/user configuration.
- [x] Chrome / Desktop Google Sync runtime alignment implemented under D-045: shared page-hosted sync runtime, Chrome page-runtime wrapper, Desktop runtime wrapper, unified status events, and preserved platform auth/storage boundaries.

## NEXT

- [x] Codex architecture planning: produced current architecture Gap Analysis against D-046 Cloud-first / Web-first direction in `docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md`.
- [x] Codex architecture planning: produced Target Architecture, new/old architecture Mapping, Repository and Platform abstraction approach in `docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md`.
- [x] Codex architecture planning: produced Migration Roadmap, Risk Register, data migration strategy, and release strategy adjustment proposal for Product Owner review in `docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md`.
- [x] Build&Test ownership of Product&Project Mg's accidental `extension/shared/js/icons.js` hotfix diff is closed. The icon library is in the baseline commit, `icons.js` has no active diff, remote Google Fonts remain removed, and `baseline-safety` verifies static Material icon coverage.
- [x] Build&Test completed MatrixView correction pass; Product&Project Mg accepted implementation with private sample hygiene required before commit: `docs/handoffs/outbox/REVIEW-MATRIXVIEW-IMPORT-PLAN-001.md`.
- [x] Build&Test completed MatrixView PDF input correction; Product&Project Mg accepted day reconstruction with private sample hygiene required before commit.
- [x] Build&Test completed MatrixView MHTML visible input cleanup; Product&Project Mg accepted implementation with private sample hygiene required before commit: `docs/handoffs/outbox/REVIEW-MATRIXVIEW-IMPORT-PLAN-001.md`.
- [x] ManageBac Phase 1 subject mapping configuration completed and accepted by Product&Project Mg; no ICS/task sync/MyManageBac/release work performed.
- [x] ManageBac Phase 2 task sync and `MyManageBac` source view completed and accepted by Product&Project Mg; real remote webcal/https link still needs manual validation because extension permissions/CORS may constrain direct fetch.
- [x] ManageBac real My Classes MHTML left-navigation parser compatibility pass completed and accepted; real sample now parses to 13 subject records without committing private sample content.
- [x] Build&Test updated ManageBac task sync to use one saved remote subscription link only: local `.ics` file choice removed, extension-context remote fetch fixed through background relay, and host permission narrowed to Keystone ManageBac events path.
- [x] Build&Test changed ManageBac ICS sync so new events are not auto-created; sync now surfaces pending event mappings for user confirmation, and existing ManageBac source tasks continue to update by UID. Product&Project Mg accepted tests; real UI confirmation pass remains user-side validation.
- [x] Task Arrange automation simplified from six-hour management review to no-throttle page-open writes: Dashboard / Focus, Planner / Task Board, and Calendar run the shared auto helper and apply eligible local scheduling changes; Popup remains no automatic Arrange. ManageBac new-event creation remains user-confirmed.
- [x] Product Owner confirmed Google data sync product definition: TimeWhere remains fully local-first without Google; Google account is optional and used only for cloud persistence and cross-device sync.
- [x] Chrome toolbar action now opens TimeWhere Side Panel; Side Panel reuses Popup runtime assets and adds current-task, navigation, temporary task, and Daily Journal surfaces.
- [x] Product Owner authorized creating/configuring the Google Cloud Chrome Extension OAuth client for the CWS extension ID `bokjekfjghliieopghopibmhjokgkjkb`; Build&Test created `TimeWhere CWS Chrome Extension` client ID `541406150907-u6pvenpfdpgfmgnv8h9f126l4hc4oru9.apps.googleusercontent.com` on 2026-05-24.
- [x] Build&Test generated local `0.2.3` CWS OAuth correction package `dist/TimeWhere-0.2.3-private-cws-sanitized-20260524-041047.zip` with SHA256 `F51880F8BE68A6B607B586EB58D1871D2F5DA06580F2E9387BABB122FCBBDA1B`; zip manifest uses the CWS OAuth client, has no `key`, and keeps Drive `appDataFolder` scope.
- [x] Product Owner approved `0.2.3` CWS upload / Submit for Review and automatic publish after review; releaseMg submitted the package on 2026-05-24 and verified final CWS status `待审核`.
- [x] Build&Test added local unpacked packaging for trusted testers and generated `dist/TimeWhere-0.2.3-local-unpacked-20260524-042303.zip` with SHA256 `6FEAFDB4C7072FFA1336F8BDA656CEDE2B0242F2D00D93D5B117C8ACBE5C23DF`. The local package keeps `manifest.key` and the development OAuth client so tester machines should load fixed extension ID `ogdjmelmfkfahppahhkkggdejjainbnd`.
- [x] Build&Test completed Google data sync v0.1 foundation: auth adapter, local snapshot export/import, Drive `appDataFolder` adapter, Settings UI, manual backup/restore, and preview-first conflict confirmation. Product&Project Mg review passed with real OAuth smoke blocked by missing OAuth client ID.
- [x] Development extension ID fixed through manifest public key for Google OAuth testing: `ogdjmelmfkfahppahhkkggdejjainbnd`. The corresponding private key is local-only and must not be committed.
- [x] Google Cloud project and Chrome Extension OAuth client created for the fixed development extension ID; Google Drive API enabled; manifest now uses the configured OAuth client ID with Drive `appDataFolder` scope only.
- [x] Google data sync v1 implemented: Drive `appDataFolder` `timewhere-sync-v1.json`, record-level bidirectional merge, tombstones, non-blocking conflicts, page-open throttled sync, save debounce, and dangerous upload/restore confirmation.
- [x] Build&Test completed local-first MVP implementation readiness pass using `docs/handoffs/outbox/HANDOFF-BUILDMVP-001.md`.
- [x] Product&Project Mg reviewed Build&Test conformance in `docs/handoffs/outbox/REVIEW-BUILDMVP-001.md`.
- [x] releaseMg completed Internal MVP acceptance and recorded NOT READY result in `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`.
- [x] Build&Test resolved release blocker `REL-MVP-BLOCKER-001` using `docs/handoffs/outbox/HANDOFF-BLOCKER-REL-MVP-001.md`.
- [x] Product&Project Mg reviewed blocker fix in `docs/handoffs/outbox/REVIEW-BLOCKER-REL-MVP-001.md`.
- [x] releaseMg rechecked `REL-MVP-BLOCKER-001` and recorded `READY FOR PRODUCT OWNER DECISION` in `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_RECHECK_2026-05-12.md`.
- [x] Product Owner approved Internal MVP acceptance; public release / CWS / tag / push / merge / deploy remain unapproved.
- [x] Product Owner approved Project Baseline Audit before further feature work.
- [x] Build&Test performs read-only code audit using `docs/handoffs/outbox/HANDOFF-CODE-AUDIT-001.md`.
- [x] Product&Project Mg reviews Build&Test code audit in `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`.
- [x] Product&Project Mg performs read-only documentation audit in `docs/handoffs/outbox/REVIEW-DOCS-AUDIT-001.md`.
- [x] Product&Project Mg combines code/docs audit results into `docs/handoffs/outbox/BASELINE-ACTION-PLAN-001.md`.
- [x] Product Owner approves Phase 1 corrective Build&Test package and canonical id strategy.
- [x] Product&Project Mg creates Build&Test handoff: `docs/handoffs/outbox/HANDOFF-BASELINE-P1-001.md`.
- [x] Build&Test implements Phase 1 corrective package using `docs/handoffs/outbox/HANDOFF-BASELINE-P1-001.md`.
- [x] Product&Project Mg reviews Build&Test result in `docs/handoffs/outbox/REVIEW-BASELINE-P1-001.md`.
- [x] Product&Project Mg creates releaseMg narrow recheck handoff: `docs/handoffs/outbox/HANDOFF-RELEASE-BASELINE-P1-RECHECK-001.md`.
- [x] releaseMg performs narrow Phase 1 recheck and returns PASS to Product&Project Mg.
- [x] Product&Project Mg records recheck receipt in `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P1-RECHECK-001.md`.
- [x] Product Owner delegates next planning/execution sequence to Product&Project Mg.
- [x] Product&Project Mg selects Phase 2A safety hardening.
- [x] Product&Project Mg creates Build&Test handoff: `docs/handoffs/outbox/HANDOFF-BASELINE-P2A-SAFETY-001.md`.
- [x] Build&Test performs Phase 2A safety hardening using `docs/handoffs/outbox/HANDOFF-BASELINE-P2A-SAFETY-001.md`.
- [x] Product&Project Mg reviews Build&Test Phase 2A result in `docs/handoffs/outbox/REVIEW-BASELINE-P2A-SAFETY-001.md`.
- [x] Product&Project Mg creates releaseMg narrow recheck handoff: `docs/handoffs/outbox/HANDOFF-RELEASE-BASELINE-P2A-RECHECK-001.md`.
- [x] releaseMg performs narrow Phase 2A recheck and returns PASS_WITH_MANUAL_EVIDENCE to Product&Project Mg.
- [x] Product&Project Mg records Phase 2A recheck receipt in `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P2A-RECHECK-001.md`.
- [x] Product&Project Mg creates docs cleanup handoff: `docs/handoffs/outbox/HANDOFF-DOCS-BASELINE-CLEANUP-001.md`.
- [x] Product&Project Mg performs documentation baseline cleanup in `docs/handoffs/outbox/REVIEW-DOCS-BASELINE-CLEANUP-001.md`.
- [x] Build&Test implemented Task Board manual task creation and quick-add due-date rules from D-016.
- [x] Build&Test completed `0.2.1` stabilization changes: Task Arrange same-day subject matching, no-throttle page-open Arrange apply, Calendar/Plan Arrange diagnostic snapshots, MatrixView Subject ID source writes/backfill, Dashboard/Popup current task display, Daily Settle displayTasks behavior, readable Google Sync conflicts, and version/documentation sync.

- [x] Codex architecture planning: drafted Repository / Platform / Auth / API interface contracts in `docs/WEBDEV_INTERFACE_CONTRACTS.md`.
- [x] Codex architecture planning: drafted entity-by-entity data authority matrix in `docs/WEBDEV_DATA_AUTHORITY_MATRIX.md`.
- [x] Codex architecture planning: drafted automatic migration plan in `docs/WEBDEV_AUTOMATIC_MIGRATION_PLAN.md`.
- [x] Codex architecture planning: drafted Cloudflare repo layout and environment/resource naming plan in `docs/WEBDEV_INTERFACE_CONTRACTS.md`.
- [x] Build&Test initialized WebDev implementation scaffold under `workers/` and `pages/` per D-048, including Cloudflare Worker API routes, D1 schema, migration entry, Pages/Vite/React shell, Repository/API clients, README handoff notes, and static scaffold tests.
- [x] Build&Test advanced WebDev Tasks migration v1: Worker `/tasks` returns normalized DTOs and supports query filters/create/update/complete/reopen/delete; Pages Tasks UI now uses Repository-backed Cloud CRUD with local read cache and blocks writes while offline or before Google SSO session.
- [x] Build&Test advanced WebDev Calendar Events migration v1: Worker `/calendar/events` returns normalized DTOs and supports date/search filters/create/update/delete; Pages Calendar UI now uses Repository-backed Cloud CRUD with local read cache and blocks writes while offline or before Google SSO session.
- [x] Build&Test advanced WebDev Structure migration v1: Worker `/plans`, `/labels`, `/buckets`, and `/containers` support CRUD; Pages Settings provides Repository-backed plan/label/bucket/container management with local read cache and blocks writes while offline or before Google SSO session.
- [x] Build&Test advanced WebDev Settings migration v1: Pages Settings uses Repository-backed `/settings` reads/writes for basic preferences with local read cache and blocks writes while offline or before Google SSO session.
- [x] Build&Test advanced WebDev Dashboard projection v1: Pages Dashboard uses a read-only Daily Settle projection helper over Cloud-backed Tasks and Containers to show current container and projected current work without local derived writes.
- [x] Build&Test verified WebDev scaffold with `node tests/webdev-scaffold.test.js`, `node tests/platform-boundary.test.js`, `git diff --check`, sensitive-info scan, and full `npm test`.
- [x] Codex architecture planning: future offline mutation queue and conflict handling design after v1 online-first write path is stable, recorded in `docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md`.
- [x] Build&Test added Cloud revision / change cursor foundation while keeping v1 offline writes blocked: D1 `sync_changes`, Worker `/sync/changes`, repository change recording, scaffold tests, and local Worker integration coverage.
- [x] Build&Test added local offline mutation queue schema/helper behind a disabled feature flag, without enabling offline writes in user-facing UI.
- [x] Build&Test added disabled/internal mutation replay contract tests and Worker validation skeleton; `/sync/mutations` validates and rejects replay without applying user offline writes.
- [x] Build&Test added Cloud conflict record scaffold for future offline mutation conflicts: D1 `sync_conflicts`, Worker `/sync/conflicts` read APIs, status exposure, and tests, without exposing conflict resolution UI or enabling offline writes.
- [x] Build&Test defined Task-only offline replay activation gates and field-level conflict preview in `/sync/mutations`, including ManageBac source-field blocking, while keeping actual offline writes disabled.
- [x] Build&Test added disabled Task replay outcome persistence hooks: D1 `sync_mutation_outcomes`, metadata-only recording from `/sync/mutations`, `GET /sync/mutations` diagnostics, and tests proving no raw mutation payload or offline write is applied.
- [x] Build&Test added Task replay transaction skeleton behind an internal disabled gate: `/sync/mutations` now reports apply/conflict/reject branch steps while `writes_enabled=false` and still applies no user offline writes.
- [x] Build&Test added disabled client-side replay diagnostics in Pages Settings: Web App can read sanitized `/sync/mutations` outcomes and inspect Task replay gates without enabling offline edits or exposing raw mutation payloads.
- [x] Build&Test added disabled sync conflict diagnostics in Pages Settings: Web App can read sanitized `/sync/conflicts` records before any conflict resolution UI is approved.
- [x] Build&Test added internal disabled Task replay dry-run endpoint: `POST /sync/mutations/dry-run` joins replay gates with existing outcomes/conflicts without applying writes, recording outcomes, or creating conflicts.
- [x] Build&Test added dry-run conflict creation preview: conflict candidates report the exact sanitized conflict record shape while `would_persist=false` and no `/sync/conflicts` row is created.
- [x] Build&Test added Task replay apply-plan preview for apply candidates: dry-run reports sanitized patch fields and future D1 write steps while `would_persist=false` and no Task row is changed.
- [x] Build&Test added replay readiness summary endpoint/card: `POST /sync/mutations/readiness-summary` and Pages Settings aggregate dry-run candidate counts, blocked reasons, and apply/conflict preview counts while replay remains disabled.
- [x] Build&Test defined the Product Owner review gate checklist for enabling Task-only replay in `docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md`, including scope lock, readiness evidence, conflict policy, UX semantics, tests, and explicit non-goals.
- [x] Build&Test added a disabled Task replay enablement simulation endpoint: `POST /sync/mutations/enablement-simulation` evaluates readiness samples against Gate A-E inputs while `writes_enabled=false`.
- [x] Build&Test added a developer-facing Settings preview card for replay enablement simulation results; it runs Gate A-E preview but still cannot enable replay writes.
- [x] Build&Test drafted the Task-only replay implementation plan for Product Owner review in `docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md`; it remains plan-only and does not enable offline writes.
- [x] Product Owner approved Phase 1 Task-only test replay server write implementation; Build&Test implemented internal test-only apply/conflict/reject/idempotency coverage while keeping user-facing offline writes blocked.
- [x] Product Owner approved WebDev offline/replay Phase 2-9 recommended boundary in D-049; separate approval remains required for prod release, Calendar/Container/Settings replay implementation, Browser Extension replay, local-over-cloud overwrite, batch conflict handling, and full-entity offline-first.
- [x] Build&Test implemented Phase 2 Task-only queued pending for create/update/complete/reopen while keeping Task delete and non-Task offline writes blocked.
- [x] Build&Test implemented Phase 3 Settings-based single Task conflict review UI with keep-cloud / discard-local / later actions only, without local-over-cloud writes.
- [x] Build&Test implemented Phase 4 local/dev replay production-gate preparation with kill switch and safety evidence; prod replay remains disabled.
- [x] Build&Test implemented Phase 5 Task-only queued pending UX hardening for retry preview and discard local pending visibility while keeping Task delete and non-Task replay blocked.
- [x] Build&Test documented Phase 6 Calendar/Container/Settings replay design only, preserving non-Task replay block and requiring separate approval before implementation.
- [x] Build&Test implemented Phase 7 read-only cross-entity dependency analysis inside replay readiness, detecting same-batch satisfied dependencies and ordering blockers without enabling replay writes.
- [x] Build&Test implemented Phase 8 Task-scope offline UX hardening: Tasks page pending banner, pending row operation/timestamp display, and direct Cloud edit/delete blocking for pending Tasks.
- [ ] Next Build&Test package: Phase 9 preview readiness hardening without prod release or replay enablement.

## LATER

- [ ] After CWS accepts/publishes `0.2.3`, install/update the CWS Private testing build and run Google data sync v1 real-auth smoke against a test Google account.
- [ ] After Windows desktop portable smoke stabilizes, evaluate whether moving shared code out of `extension/` is worth a staging-build step. Do not move Chrome package files outside the extension root until staging is approved.
- [x] releaseMg completes CWS cancel-review, fixed package upload, and Submit for Review for the `0.2.1` Purple Potassium fix.
- [ ] Decide whether Side Panel / quick-add changes should be packaged for a later CWS update after the current pending review resolves.
- [ ] Product Owner confirms risk acceptance for the regenerated `0.2.0` package being prepared without automated/browser tests.
- [ ] Add feature specs only when scope/risk requires durable boundaries.
- [ ] Create formal handoffs only for cross-session, release, privacy/security, high-risk, or Product Owner-requested work.

## Blockers

| Blocker | Owner | Required action |
|---|---|---|
| Product Owner authority label/name not recorded | Product Owner | Confirm preferred authority label/name when needed. |
| Public release boundary | Build&Test / releaseMg | D-029 approves only the `0.2.3` CWS Private testing upload / Submit for Review and automatic publish after review. Do not public-list, tag, merge, deploy, or perform any non-CWS release without explicit Product Owner approval. |
| Test waiver for regenerated package | Product Owner / releaseMg | `0.2.0` CWS Private artifact was regenerated without automated/browser tests per Product Owner instruction. Record this as a waiver/risk, not as PASS evidence. |
| CWS OAuth extension ID follow-up | Product Owner | Sanitized CWS package removes manifest `key` because CWS rejects it. CWS OAuth client was created for store extension ID `bokjekfjghliieopghopibmhjokgkjkb`; the submitted `0.2.3` package injects that client ID while source keeps the development client ID for unpacked testing. |
| CWS review follow-up | Product Owner / releaseMg | Monitor the `0.2.3` CWS Private OAuth correction review outcome. Automatic publish after review is enabled; public listing expansion, tag, merge, deploy, and release remain unapproved. |
| Manual browser validation not run | CLOSED | releaseMg executed `docs/TEST_PLAN.md` L3 checklist and recorded results in `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`. |
| Container id documentation mismatch | Product&Project Mg / Build&Test | Product Owner approved UUID/string ids for tasks, containers, events, and habits; planner helper records may remain numeric. Documentation cleanup remains pending. |
| P1 baseline behavior risks | CLOSED | Build&Test fix passed Product&Project Mg review and releaseMg narrow recheck returned PASS. |
| Phase 2A safety hardening | CLOSED | Build&Test fix passed Product&Project Mg review and releaseMg narrow recheck returned PASS_WITH_MANUAL_EVIDENCE. |
| Documentation baseline drift | CLOSED | Product docs now align to current local-first MVP baseline and mark future/out-of-scope features clearly. |
| REL-MVP-BLOCKER-001: Focus Dashboard Dexie SchemaError | CLOSED | releaseMg MV-01 recheck passed; Focus Dashboard first-load console smoke captured no errors after Build&Test fix. |
| Audit no-edit boundary | Product&Project Mg / Build&Test | During Project Baseline Audit, do not modify code or tests without explicit Product Owner approval. |
| Product&Project Mg product-code boundary deviation | CLOSED | `extension/shared/js/icons.js` is now part of accepted baseline work; current worktree has no active icon diff and baseline-safety verifies local icon coverage. |

## Completed

- [x] Root governance docs created from imported template.
- [x] Agent role contracts and governance templates copied into `docs/`.
- [x] Product Owner decisions recorded for Lightweight mode, import source equivalence, Internal MVP acceptance, version naming, and local-first MVP scope.
- [x] Build&Test handoff created: `docs/handoffs/outbox/HANDOFF-BUILDMVP-001.md`.
- [x] releaseMg blocked handoff created: `docs/handoffs/outbox/HANDOFF-RELEASEMVP-001.md`.
- [x] Build&Test local-first MVP readiness pass implemented scoped fixes and ran `node tests/scheduling.test.js` with 83/83 passing.
- [x] Product&Project Mg conformance review completed: `docs/handoffs/outbox/REVIEW-BUILDMVP-001.md`.
- [x] releaseMg Internal MVP acceptance completed with `NOT READY` report: `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`.
- [x] Build&Test blocker-fix handoff created: `docs/handoffs/outbox/HANDOFF-BLOCKER-REL-MVP-001.md`.
- [x] Build&Test blocker fix completed: `REL-MVP-BLOCKER-001`.
- [x] Product&Project Mg blocker-fix review completed: `docs/handoffs/outbox/REVIEW-BLOCKER-REL-MVP-001.md`.
- [x] releaseMg recheck handoff created: `docs/handoffs/outbox/HANDOFF-RELEASEMVP-RECHECK-001.md`.
- [x] releaseMg blocker recheck passed: `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_RECHECK_2026-05-12.md`.
- [x] Product Owner approved Internal MVP acceptance on 2026-05-12.
- [x] Project Baseline Audit opened by Product Owner approval on 2026-05-12.
- [x] Build&Test code audit handoff created: `docs/handoffs/outbox/HANDOFF-CODE-AUDIT-001.md`.
- [x] Product&Project Mg docs audit handoff created: `docs/handoffs/outbox/HANDOFF-DOCS-AUDIT-001.md`.
- [x] Build&Test code audit result accepted into baseline planning: `docs/handoffs/outbox/REVIEW-CODE-AUDIT-001.md`.
- [x] Product&Project Mg documentation audit completed: `docs/handoffs/outbox/REVIEW-DOCS-AUDIT-001.md`.
- [x] Baseline action plan created: `docs/handoffs/outbox/BASELINE-ACTION-PLAN-001.md`.
- [x] Product Owner approved Phase 1 corrective package and canonical id strategy on 2026-05-12.
- [x] Phase 1 Build&Test handoff created: `docs/handoffs/outbox/HANDOFF-BASELINE-P1-001.md`.
- [x] Build&Test completed Phase 1 corrective package.
- [x] Product&Project Mg Phase 1 review completed: `docs/handoffs/outbox/REVIEW-BASELINE-P1-001.md`.
- [x] releaseMg narrow Phase 1 recheck handoff created: `docs/handoffs/outbox/HANDOFF-RELEASE-BASELINE-P1-RECHECK-001.md`.
- [x] releaseMg narrow Phase 1 recheck returned PASS.
- [x] Product&Project Mg accepted recheck result: `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P1-RECHECK-001.md`.
- [x] Product&Project Mg selected Phase 2A safety hardening as the next package.
- [x] Phase 2A Build&Test handoff created: `docs/handoffs/outbox/HANDOFF-BASELINE-P2A-SAFETY-001.md`.
- [x] Build&Test completed Phase 2A safety hardening.
- [x] Product&Project Mg Phase 2A review completed: `docs/handoffs/outbox/REVIEW-BASELINE-P2A-SAFETY-001.md`.
- [x] releaseMg narrow Phase 2A recheck handoff created: `docs/handoffs/outbox/HANDOFF-RELEASE-BASELINE-P2A-RECHECK-001.md`.
- [x] releaseMg narrow Phase 2A recheck returned PASS_WITH_MANUAL_EVIDENCE.
- [x] Product&Project Mg accepted Phase 2A recheck result: `docs/handoffs/outbox/REVIEW-RELEASE-BASELINE-P2A-RECHECK-001.md`.
- [x] Documentation baseline cleanup handoff created: `docs/handoffs/outbox/HANDOFF-DOCS-BASELINE-CLEANUP-001.md`.
- [x] Documentation baseline cleanup completed: `docs/handoffs/outbox/REVIEW-DOCS-BASELINE-CLEANUP-001.md`.

## Next Planning Candidates

- [x] Phase 2A safety hardening: DOM escaping, `sync_log.synced` latent query risk, default container init consolidation, remote font dependency cleanup, demo/dev utility gating, Settings half-usable control cleanup.
- [x] Documentation baseline cleanup: `DATA_MODEL.md`, `ARCHITECTURE.md`, `MODULES.md`, `TEST_PLAN.md`, `DEPLOY.md` current-stage warning.

## Next Planning Candidates

- [ ] Product planning for the next feature package.
- [ ] Full manual unpacked-extension acceptance pass for a broader internal milestone.
- [x] Git hygiene / commit planning for the completed baseline work: `docs/handoffs/outbox/GIT-HYGIENE-COMMIT-PLAN-001.md`.
- [ ] Product Owner approves branch/stage/commit sequence, if ready.

## Audit Work Packages

### Build&Test Code Audit

- Handoff: `docs/handoffs/outbox/HANDOFF-CODE-AUDIT-001.md`
- Mode: read-only
- Output: code baseline audit report
- Prohibited: code/test modifications, fixes, refactors, schema migrations, release actions

### Product&Project Mg Documentation Audit

- Handoff: `docs/handoffs/outbox/HANDOFF-DOCS-AUDIT-001.md`
- Mode: read-only
- Output: documentation baseline audit report
- Prohibited: product/test code changes, product scope changes, public release actions
