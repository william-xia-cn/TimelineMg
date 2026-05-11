# Product&Project Mg Documentation Baseline Audit

## Metadata

- Review ID: REVIEW-DOCS-AUDIT-001
- Date: 2026-05-12
- Role: Product&Project Mg
- Source handoff: `docs/handoffs/outbox/HANDOFF-DOCS-AUDIT-001.md`
- Status: Complete

## Documents Audited

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- `docs/TEST_PLAN.md`
- `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
- `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_RECHECK_2026-05-12.md`
- Relevant handoffs and reviews under `docs/handoffs/outbox/`

## Commands / Searches Run

- `rg -n "MVP|Google|Sync|notification|identity|alarms|1\\.0\\.0|0\\.1\\.0|Arrange|Settings|Popup|sync\\.js|container_id|auto-increment|自增|Chrome Web Store|CWS|fonts.googleapis|ManageBac|Daily Settle|开始|延后" docs AGENTS.md PROJECT_MASTER.md TASK_BOARD.md DECISIONS.md`
- `git status --short`

No product tests were run by Product&Project Mg for this documentation audit.

## Authority Hierarchy

Current authority order from `AGENTS.md`:

1. `DECISIONS.md`
2. `PROJECT_MASTER.md`
3. `TASK_BOARD.md`
4. Domain-specific authority docs
5. `AGENTS.md`
6. `PROJECT_WORKFLOW.md`

Therefore, Internal MVP acceptance approval and no-public-release boundary in `DECISIONS.md` / `PROJECT_MASTER.md` override stale product-doc statements.

## Findings By Severity

### P1 - Must Resolve Before Next Planning Baseline

| Finding | Evidence | Impact | Recommended cleanup |
|---|---|---|---|
| Product docs still describe the project as MVP development or incomplete, while governance state says Internal MVP acceptance is approved and baseline audit is active. | `docs/DESIGN_v2.0.md:6`, `docs/DESIGN_v2.0.md:473`, `docs/ARCHITECTURE.md:5`, `PROJECT_MASTER.md:8` | Future agents may treat accepted MVP surfaces as unfinished or reopen scope without approval. | Add a current-state note or update status language in design/architecture docs after PO approves doc cleanup. |
| Google Sync / OAuth / Calendar API language appears as current architecture in product docs, but governance says Google Sync is out of MVP scope. | `docs/ARCHITECTURE.md:15`, `docs/ARCHITECTURE.md:40-43`, `docs/ARCHITECTURE.md:266-301`, `docs/DESIGN_v2.0.md:215-229`, `PROJECT_MASTER.md:81` | Agents may accidentally re-enable sync work or test against unapproved cloud behavior. | Reclassify Google Sync as future/out-of-scope in current baseline docs. |
| Manifest and permission documentation is stale relative to accepted local-first MVP. | `docs/ARCHITECTURE.md:316-324`, `PROJECT_MASTER.md:93-100` | Release or implementation agents may expect `identity`, `notifications`, `alarms`, or version `1.0.0`, conflicting with current `0.1.0` local-first MVP. | Update architecture manifest example to current MVP state, or clearly mark it historical/future. |
| Popup module docs claim complete/defer behavior while code audit found start/defer half-implemented. | `docs/MODULES.md:425`, Build&Test code audit evidence for `extension/popup/popup.js` | Documentation overstates behavior and can mislead release or QA planning. | After PO chooses remediation path, align module docs and tests to real behavior. |

### P2 - Should Resolve Soon

| Finding | Evidence | Impact | Recommended cleanup |
|---|---|---|---|
| Data model id types are mixed across design/data docs and implementation. | `docs/DESIGN_v2.0.md:112`, `docs/DESIGN_v2.0.md:170`, `docs/DATA_MODEL.md:170`, `docs/DATA_MODEL.md:302`, `docs/DATA_MODEL.md:319` | Schema migrations, imports, Calendar overrides, and type checks can drift. | Product Owner should approve canonical id strategy, then update `DATA_MODEL.md`, `DESIGN_v2.0.md`, and related tests. |
| Settings documentation still emphasizes Google account/import/reminder configuration beyond minimal MVP. | `docs/MODULES.md:313`, `docs/MODULES.md:353-379`, `docs/DATA_MODEL.md:419-448` | Build&Test may implement excluded surfaces when asked to "finish Settings." | Split Settings into current local-first MVP vs future sync/notification sections. |
| Arrange is correctly described as future in places, but backlog/status sections still mix it with current MVP pressure. | `docs/DESIGN_v2.0.md:238-261`, `docs/DESIGN_v2.0.md:418`, `PROJECT_MASTER.md:82` | Next work may accidentally become Arrange implementation instead of baseline hardening. | Keep Arrange as explicit future iteration, not part of first post-baseline remediation. |
| `docs/TEST_PLAN.md` expects Settings to load `sync.js`, but accepted local-first MVP removed active sync surface. | Build&Test audit cited `docs/TEST_PLAN.md:34` and `extension/pages/settings/settings.html` current behavior | Test plan can create false failures or encourage reintroducing sync. | Update L2 test expectations for local-first MVP. |
| Architecture says Google Fonts are localized/offline, while code audit found pages still load Google Fonts remotely. | `docs/ARCHITECTURE.md:18`, `docs/ARCHITECTURE.md:386`, Build&Test code audit evidence | Offline/local-first claims are stronger than implementation evidence. | Either remove remote font loads or downgrade doc claim until fixed. |

### P3 - Track

| Finding | Evidence | Impact | Recommended cleanup |
|---|---|---|---|
| `AGENTS.md` still says the project is "currently an MVP development project." | `AGENTS.md:7` | Minor stage wording drift. | Change to "Internal MVP accepted; baseline/future work remains lightweight" during docs cleanup. |
| `docs/DEPLOY.md` still contains Google Cloud and Chrome Web Store deployment instructions. | `docs/DEPLOY.md:9-16`, `docs/DEPLOY.md:134` | Useful future reference, but dangerous if mistaken for approved current work. | Add a prominent "not approved for current stage" banner or move under future release docs. |

## Missing Documentation

- No single current baseline summary ties together accepted MVP behavior, known code risks, and the no-public-release boundary.
- No canonical data-id decision is recorded yet.
- No first remediation package has been approved after the baseline audits.

## Recommended Documentation Cleanup Order

1. Record Product Owner decision for canonical id strategy.
2. Add a current baseline note or update `PROJECT_MASTER.md` to point at the baseline action plan.
3. Update `docs/DATA_MODEL.md` for id strategy and local-first MVP sync boundary.
4. Update `docs/ARCHITECTURE.md` for current manifest permissions, sync stub status, and local-first/offline claims.
5. Update `docs/MODULES.md` for Popup and Settings actual/current behavior after remediation choice.
6. Update `docs/TEST_PLAN.md` so L2/L3 checks match local-first MVP and post-remediation expectations.
7. Add a warning to `docs/DEPLOY.md` that it is not an approved current-stage procedure.

## No-Modification Confirmation

Product&Project Mg did not modify product code or test code. This audit report is documentation-only baseline work.
