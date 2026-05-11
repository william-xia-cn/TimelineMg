# Release Gate Report

## Metadata

- Report ID: RELEASE-GATE-INTERNAL-MVP-2026-05-11
- Date: 2026-05-11
- Release/deployment target: Internal MVP acceptance
- Candidate version: 0.1.0
- Candidate branch: master
- Candidate commit: 3875d827993f8252a64fdca7ef93b663bae6c328 with uncommitted MVP candidate changes present
- Package/artifact path: N/A
- Package/artifact SHA256: N/A
- Prepared by: releaseMg
- Status: Final / Not Ready

## Source Documents

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`
- `docs/handoffs/outbox/HANDOFF-RELEASEMVP-001.md`
- `docs/handoffs/outbox/REVIEW-BUILDMVP-001.md`
- `docs/handoffs/outbox/HANDOFF-BUILDMVP-001.md`
- `docs/TEST_PLAN.md`
- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- Build&Test implementation report: provided in Product Owner prompt and summarized by `TASK_BOARD.md` / `REVIEW-BUILDMVP-001.md`
- Product&Project Mg conformance review: `docs/handoffs/outbox/REVIEW-BUILDMVP-001.md`

## Execution Scope

| Item | Value |
|---|---|
| Production environment used | No |
| Test environment used | Yes, temporary Chromium unpacked-extension profile |
| Destructive actions allowed | No |
| Config changes allowed | No |
| Cloud/database writes allowed | No |
| Publish/deploy/submit allowed | No |

## Gate Results

| Gate | Result | Evidence summary | Notes |
|---|---|---|---|
| Preflight | PASS | Authority docs, Build&Test evidence, and Product&Project Mg review were available. | Target is Internal MVP acceptance only. |
| Artifact verification | PASS | `extension/manifest.json` parsed successfully; manifest version is `0.1.0`. | No packaged artifact/hash required for this internal acceptance pass. |
| Automated tests | PASS | `node tests/scheduling.test.js`: 83/83 passing. `node --check` on modified JS entry files: PASS. | Passing tests are evidence only. |
| Manual acceptance | FAIL | L3 browser validation executed. MV-01 failed because Focus logs a Dexie schema error on first load. MV-02 through MV-08 passed with manual browser evidence. | Failure blocks readiness. |
| Documentation consistency | PASS_WITH_MANUAL_EVIDENCE | Product&Project Mg cleared scope for releaseMg acceptance; known `DATA_MODEL.md` container id mismatch preserved as risk. | Not treated as release pass. |
| Evidence privacy | PASS_WITH_MANUAL_EVIDENCE | Evidence summary contains no secrets, account email, token, cookie, password, private screenshot, raw profile data, or local browser profile path. | Temporary browser profile was not recorded as evidence. |

## Acceptance Test Results

| Case | Result | Evidence | Notes |
|---|---|---|---|
| MV-01 首次加载 | FAIL | Focus opened and rendered 3 default containers, but browser console captured `SchemaError: KeyPath created_at on object store habits is not indexed`. | Violates checklist requirement "控制台无报错". |
| MV-02 任务创建流程 | PASS_WITH_MANUAL_EVIDENCE | Quick-created `测试任务A`; `start_date=2026-05-11`; `duration=45`; detail `schedule_time` and `duration` fields visible; `20:00` timed badge displayed. | Browser time was fixed at 2026-05-11 19:00 GMT+8 for deterministic validation. |
| MV-03 Focus Dashboard 当下任务 | PASS_WITH_MANUAL_EVIDENCE | At mocked 19:00, current column badge showed `学习时间 · 150min`; urgent `测试任务A` appeared before low-priority `测试任务Low`. | Confirms Daily Settle projection and priority order. |
| MV-04 Calendar 容器渲染 | PASS_WITH_MANUAL_EVIDENCE | Calendar week view showed layer-1 `学习时间`, dashed layer-2 `自由时间`, task list inside container including `测试任务A`, and layer selector in container edit dialog. |  |
| MV-05 Popup 当前任务 | PASS_WITH_MANUAL_EVIDENCE | Popup displayed Daily Settle task `测试任务A` with container `学习时间`; clicking complete updated task progress to `completed`. |  |
| MV-06 Settings 容器管理 | PASS_WITH_MANUAL_EVIDENCE | Settings showed 3 containers with layer badges; add modal opened; color/layer controls changed; `验收容器` added then deleted. |  |
| MV-07 Settings 调度参数 | PASS_WITH_MANUAL_EVIDENCE | Changed default duration to 30 in Settings; quick-created `测试任务B` with `duration=30`. |  |
| MV-08 逾期标签 | PASS_WITH_MANUAL_EVIDENCE | Set `测试任务B` due date to `2026-05-10`; task card showed `逾期`. |  |
| Out-of-scope MVP surfaces | PASS_WITH_MANUAL_EVIDENCE | Manifest permissions are `storage`, `tabs`, `unlimitedStorage`; settings keep `google_connected=false` and `sync_enabled=false`; no Chrome Web Store submission path observed. | Local ICS file import UI remains visible, but no URL subscription/cloud sync path was observed. |

## Failed Items

- MV-01: Focus Dashboard first load emits a console error: `SchemaError: KeyPath created_at on object store habits is not indexed`.

## Blockers

| Blocker ID | Severity | Owner role | Description | Required next action |
|---|---|---|---|---|
| REL-MVP-BLOCKER-001 | High | Build&Test | Focus Dashboard calls a habit query that orders by `created_at`, but the current IndexedDB habits store does not index `created_at`. Browser console records a Dexie SchemaError during `loadDashboardData`. | Fix implementation and rerun relevant automated/static checks plus releaseMg MV-01 smoke. |

## Waivers And Deferrals

| Item | State | Reason | Approved by |
|---|---|---|---|
| None | N/A | No waiver or deferral requested. | N/A |

## Evidence Files

- `docs/TEST_PLAN.md`
- `docs/handoffs/outbox/REVIEW-BUILDMVP-001.md`
- `TASK_BOARD.md`
- Runtime command: `node tests/scheduling.test.js` => PASS, 83/83.
- Runtime command: `node --check` on modified JS entry files => PASS.
- Runtime command: manifest JSON parse => PASS.
- Browser validation: temporary Chromium unpacked-extension run, fixed browser time `2026-05-11T19:00:00+08:00`.
- Console-error probe: Focus page reported `SchemaError: KeyPath created_at on object store habits is not indexed`.

## Known Risks

- Manual browser validation was not run by Build&Test; releaseMg executed it and found one release blocker.
- `docs/DATA_MODEL.md` describes container `id` as numeric auto-increment while current implementation uses generated string ids. Product&Project Mg allowed acceptance to proceed, but this remains a documentation/model consistency risk.
- `sync_log` remains local audit plumbing. It does not expose active cloud sync behavior in the MVP path, but related schema/API consistency should be treated carefully in future sync work.
- `sync.js` is an explicit local-first MVP stub returning `success: false` / `reason: out_of_scope_for_mvp`; this is acceptable for Internal MVP but not public release readiness.
- Settings and Calendar still expose local `.ics` file import UI. releaseMg did not observe an active ManageBac URL subscription or cloud sync path.
- Internal MVP acceptance must not be confused with public release readiness, Chrome Web Store submission, tag, push, merge, publish, deploy, upload, or submit approval.

## Release Readiness Recommendation

`NOT READY`

## Product Owner Decision Required

- Product Owner final decision is required after Build&Test resolves or explicitly returns the blocker.
- No public release, Chrome Web Store submission, tag, push, merge, publish, deploy, upload, or submit action is approved by this report.

## Privacy Check

Evidence contains no private user identifier, token, cookie, password, account details, private screenshots, local profile path, or raw profile identifiers.
