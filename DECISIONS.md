# DECISIONS

Durable product, architecture, release, deployment, and risk decisions.

Do not rewrite historical decisions. Add a new row when a decision changes.

Decision status values:

- `Active`
- `Superseded`
- `Dropped`
- `Pending PO`

| ID | Decision | Status | Notes |
|---|---|---|---|
| D-001 | Use lightweight three-role Codex governance for TimeWhere until Product Owner chooses a different mode. | Active | Based on `_imports/governance-template/README.md` and `MIGRATION_GUIDE.md`; template default is Lightweight. |
| D-002 | Product Owner keeps final product, scope, risk, and release/deployment authority. | Active | Imported from governance template role contracts and root rules. |
| D-003 | Publish, deploy, submit, tag, merge, or release actions require explicit Product Owner approval. | Active | Imported from `AGENTS_TEMPLATE.md`, `PROJECT_WORKFLOW_TEMPLATE.md`, and `ReleaseMg.md`. |
| D-004 | Exact prompt-listed source files were not all present; initialization used actual imported template files available in `_imports/governance-template/`. | Superseded | Superseded by D-006. Missing: `EXPORT_README.md`, `SOURCE_INVENTORY.md`, non-template root filenames. Present equivalents included `README.md`, `MIGRATION_GUIDE.md`, and `*_TEMPLATE.md`. |
| D-005 | Governance mode is Lightweight. | Active | Product Owner decision for MVP build bootstrap. |
| D-006 | `_imports/governance-template/README.md` and `MIGRATION_GUIDE.md` are accepted as partial equivalents for missing `EXPORT_README.md` and `SOURCE_INVENTORY.md`. | Active | Product Owner decision for governance import source resolution. |
| D-007 | Active release target is Internal MVP acceptance. | Active | Product Owner decision; not a public release or Chrome Web Store submission target. |
| D-008 | Version naming uses package / extension release version `0.1.0` and design-doc version `v2.3`. | Active | Product Owner decision; package/release identity and design document lineage are tracked separately. |
| D-009 | MVP scope is local-first MVP. | Active | Product Owner decision; Google Sync implementation and other advanced scheduling/release items are excluded from this MVP package. |
| D-010 | Product Owner approved Internal MVP acceptance. | Active | Approved on 2026-05-12 after releaseMg recheck reported `READY FOR PRODUCT OWNER DECISION`. This is not public release readiness and does not approve Chrome Web Store, tag, push, merge, publish, deploy, upload, or submit. |
| D-011 | Open Project Baseline Audit before further feature work. | Active | Product Owner approved a read-only code and documentation audit on 2026-05-12. No code changes are approved during the audit without explicit Product Owner approval. |
| D-012 | Approve Phase 1 corrective Build&Test package. | Active | Product Owner approved on 2026-05-12. Scope is limited to Popup task actions, Daily Settle task-pool consistency, and minimal regression coverage. This does not approve public release, Chrome Web Store, tag, push, merge, publish, deploy, upload, or submit. |
| D-013 | Canonical id strategy: `tasks`, `containers`, `events`, and `habits` use string UUID ids; planner helper records may remain numeric for now. | Active | Product Owner approved Product&Project Mg recommendation on 2026-05-12. No schema migration is approved by this decision alone. |
| D-014 | Product&Project Mg may select and initiate the next baseline work package. | Active | Product Owner instructed Product&Project Mg to decide the plan and execute on 2026-05-12. Product&Project Mg selected Phase 2A safety hardening before documentation baseline cleanup. This does not approve public release, Chrome Web Store, tag, push, merge, publish, deploy, upload, or submit. |
| D-015 | Buckets and labels are scoped to a Plan; labels stay lightly defined for now. Subject Plan default buckets are `上课`, `作业`, `单元测试`, `阶段考试`; `Other School Plan` default buckets are `事项`, `活动`, `申请`, `其他`; ManageBac is Task source metadata, not a bucket or label. | Active | Product Owner confirmed on 2026-05-14. Buckets are initialized from templates per Plan and may be edited inside each concrete Plan. No DB schema migration is approved by this decision alone. |
| D-016 | Manual task creation must require `due_date`; if `start_date` is empty, it defaults to the selected `due_date`. Task Board quick-add fields depend on current grouping: due-date grouping includes Bucket; bucket grouping includes start date and required due date; other groupings include start date, required due date, and Bucket. | Active | Product Owner confirmed on 2026-05-14. This is a manual creation and quick-add UX rule, not a DB schema migration. Imported/source tasks may still be governed by their own source-specific rules. |
| D-017 | Task Date Arrange is now in current baseline stabilization scope. Arrange may calculate `start_date` and priority upgrades, but it must preview changes first and write task updates only after user confirmation. Priority may be upgraded to `important` / `urgent` but must not be downgraded. Daily Settle Layer 2 remains an overflow receiver for all overflow tasks, not only urgent or overdue tasks. ManageBac source tasks allow local execution and scheduling fields (`progress`, `completed_at`, `start_date`, `priority`) while source content fields (`title`, `due_date` / `deadline`, description/source content, source UID/URL/metadata) remain read-only. | Active | Product Owner confirmed on 2026-05-14. D-018 refines the trigger and confirmation UI. This decision does not approve background alarms, Google Sync, notifications, Chrome Web Store work, public release, tag, push, merge, publish, deploy, upload, or submit. |
| D-018 | Six-hour management automation is unified under Dashboard entry. Popup, Calendar, and Planner page opening must not silently run six-hour Arrange or ManageBac sync checks. Dashboard / Focus entry checks every six hours, combines Task Date Arrange preview and ManageBac new-event preview, persists a `management_review_pending` state when user confirmation is required, and opens a full confirmation page. Planner `my ManageBac` manual sync is ManageBac-only and opens the same confirmation page. Users must either confirm selected items or skip all before the pending management review is complete. | Active | Product Owner confirmed on 2026-05-15. This replaces the previous “Popup / Dashboard / Planner / Calendar all trigger six-hour checks” interpretation. It does not approve background alarms, automatic public release work, tag, push, merge, publish, deploy, upload, or submit. |

## Change Rule

- New durable decisions must be appended.
- If a decision is replaced, mark the old one `Superseded` and add a new decision.
- Product Owner owns final product, scope, risk, and release/deployment decisions.
