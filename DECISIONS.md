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

## Change Rule

- New durable decisions must be appended.
- If a decision is replaced, mark the old one `Superseded` and add a new decision.
- Product Owner owns final product, scope, risk, and release/deployment decisions.
