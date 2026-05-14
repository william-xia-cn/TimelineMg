# TASK_BOARD

## Active Target

- Baseline Stabilized
- Internal MVP acceptance, Phase 1 corrective work, Phase 2A safety hardening, and documentation baseline cleanup are complete. Public release / CWS / tag / push / merge / deploy remain unapproved.

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

## NEXT

- [ ] Build&Test takes ownership of Product&Project Mg's accidental `extension/shared/js/icons.js` hotfix diff using `docs/handoffs/outbox/HANDOFF-ICON-HOTFIX-001.md`.
- [x] Build&Test completed MatrixView correction pass; Product&Project Mg accepted implementation with private sample hygiene required before commit: `docs/handoffs/outbox/REVIEW-MATRIXVIEW-IMPORT-PLAN-001.md`.
- [x] Build&Test completed MatrixView PDF input correction; Product&Project Mg accepted day reconstruction with private sample hygiene required before commit.
- [x] Build&Test completed MatrixView MHTML visible input cleanup; Product&Project Mg accepted implementation with private sample hygiene required before commit: `docs/handoffs/outbox/REVIEW-MATRIXVIEW-IMPORT-PLAN-001.md`.
- [x] ManageBac Phase 1 subject mapping configuration completed and accepted by Product&Project Mg; no ICS/task sync/MyManageBac/release work performed.
- [x] ManageBac Phase 2 task sync and `MyManageBac` source view completed and accepted by Product&Project Mg; real remote webcal/https link still needs manual validation because extension permissions/CORS may constrain direct fetch.
- [x] ManageBac real My Classes MHTML left-navigation parser compatibility pass completed and accepted; real sample now parses to 13 subject records without committing private sample content.
- [x] Build&Test updated ManageBac task sync to use one saved remote subscription link only: local `.ics` file choice removed, extension-context remote fetch fixed through background relay, and host permission narrowed to Keystone ManageBac events path.
- [x] Build&Test changed ManageBac ICS sync so new events are not auto-created; sync now surfaces pending event mappings for user confirmation, and existing ManageBac source tasks continue to update by UID. Product&Project Mg accepted tests; real UI confirmation pass remains user-side validation.
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
- [ ] Build&Test implements Task Board manual task creation and quick-add due-date rules from D-016.

## LATER

- [ ] Add feature specs only when scope/risk requires durable boundaries.
- [ ] Create formal handoffs only for cross-session, release, privacy/security, high-risk, or Product Owner-requested work.

## Blockers

| Blocker | Owner | Required action |
|---|---|---|
| Product Owner authority label/name not recorded | Product Owner | Confirm preferred authority label/name when needed. |
| Public release boundary | Build&Test / releaseMg | Do not treat Internal MVP acceptance as Chrome Web Store submission or public release readiness. |
| Manual browser validation not run | CLOSED | releaseMg executed `docs/TEST_PLAN.md` L3 checklist and recorded results in `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`. |
| Container id documentation mismatch | Product&Project Mg / Build&Test | Product Owner approved UUID/string ids for tasks, containers, events, and habits; planner helper records may remain numeric. Documentation cleanup remains pending. |
| P1 baseline behavior risks | CLOSED | Build&Test fix passed Product&Project Mg review and releaseMg narrow recheck returned PASS. |
| Phase 2A safety hardening | CLOSED | Build&Test fix passed Product&Project Mg review and releaseMg narrow recheck returned PASS_WITH_MANUAL_EVIDENCE. |
| Documentation baseline drift | CLOSED | Product docs now align to current local-first MVP baseline and mark future/out-of-scope features clearly. |
| REL-MVP-BLOCKER-001: Focus Dashboard Dexie SchemaError | CLOSED | releaseMg MV-01 recheck passed; Focus Dashboard first-load console smoke captured no errors after Build&Test fix. |
| Audit no-edit boundary | Product&Project Mg / Build&Test | During Project Baseline Audit, do not modify code or tests without explicit Product Owner approval. |
| Product&Project Mg product-code boundary deviation | Build&Test / Product&Project Mg | Build&Test must review and take ownership of the current `extension/shared/js/icons.js` hotfix diff before it is treated as accepted implementation work. |

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
