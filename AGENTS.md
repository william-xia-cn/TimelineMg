# AGENTS.md - TimeWhere Agent Rules

This document defines shared rules for AI agents and developers working on TimeWhere.

## 1. Lightweight Workflow

TimeWhere has an Internal MVP accepted baseline and is now in baseline stabilization / follow-up planning. Default workflow should stay lightweight and traceable.

- Small routine work should not create spec, handoff, audit, or release-report files by default.
- Medium work should preserve only necessary scope, implementation result, test evidence, and risk notes.
- Release, production, privacy, security, deployment, and high-risk work may use release checklists, readiness reports, or formal handoffs.
- Manual evidence is allowed, but must be labeled clearly, for example `PASS_WITH_MANUAL_EVIDENCE`.
- Agents must not rely on memory for important facts. Use repository documents and current command/tool output.

Default durable status locations:

- `TASK_BOARD.md`: next actions, blockers, current task status.
- `PROJECT_MASTER.md`: stable project facts, phase, release/deployment state.
- `DECISIONS.md`: durable product, architecture, release, and risk decisions.
- `docs/release/*`: release evidence or release blockers only, not ordinary daily process.

## 2. Source Of Truth

When documents conflict, use this authority order:

1. `DECISIONS.md` - durable product, architecture, and release decisions.
2. `PROJECT_MASTER.md` - current stage, active release/deployment target, execution boundary.
3. `TASK_BOARD.md` - active task tracking; does not override decisions or stage boundaries.
4. Domain-specific authority docs, such as design, policy, API, data model, or UI docs.
5. `AGENTS.md` - execution discipline and agent behavior rules.
6. `PROJECT_WORKFLOW.md` - workflow and role coordination.

If conflict cannot be resolved, stop and ask the Product Owner.

## 3. Three-Agent Model

Daily execution is handled by three separated Codex roles:

| Role | Responsibility |
|---|---|
| `Product&Project Mg` | Requirements, specifications, planning, acceptance criteria, implementation conformance review. |
| `Build&Test` | Code implementation, test implementation, minimal relevant verification, implementation evidence. |
| `releaseMg` | Acceptance, release gates, deployment readiness, release evidence, readiness recommendation. |

Product Owner keeps final product, risk, and release/deployment decisions.

## 4. External Advisor Boundary

ChatGPT or any external advisor is not the daily project manager.

Use external advice only for high-value decision points:

- product model changes;
- V0/V1 or release-scope uncertainty;
- architecture boundary uncertainty;
- storage, cloud sync, statistics, security, privacy, or permission-model changes;
- release blocker disputes;
- role-boundary conflicts;
- suspected agent scope violation;
- Product Owner wants a second opinion.

Do not escalate ordinary small bugfixes, routine docs sync, common test failures, small copy changes, or ordinary implementation details by default.

## 5. Role Contracts

Mandatory role contracts:

- `docs/agents/ProductProjectMg.md`
- `docs/agents/BuildTest.md`
- `docs/agents/ReleaseMg.md`

A role session must read its own contract before execution. If a user prompt conflicts with the role contract, stop and ask for an explicit Product Owner override.

## 6. Code And Test Discipline

- Product code changes require relevant tests unless Product Owner explicitly defers them.
- Test failures block commit unless Product Owner explicitly approves a risk path.
- Pure documentation changes do not require tests.
- Do not expand scope, refactor opportunistically, or migrate data unless explicitly assigned.
- Do not claim remote, deployment, GitHub, app-store, or production state from memory; verify with current evidence.

## 7. Git And Release Discipline

- Commit only scoped changes.
- Do not tag, merge, publish, deploy, submit, or release without explicit Product Owner approval.
- Passing tests are implementation evidence, not release approval.
- Release readiness recommendation belongs to `releaseMg`; final decision belongs to Product Owner.

## 8. Privacy And Production Safety

Agents must not record secrets or private identifiers in public repo documents.

Forbidden in repo evidence unless explicitly redacted:

- passwords;
- tokens;
- cookies;
- account emails;
- child/user identifiers;
- local profile paths;
- raw production database rows with private identifiers;
- screenshots containing private account or user data.

## 9. Browser Control For Store Consoles

For Chrome Web Store, vendor dashboards, or similar authenticated release
consoles, prefer the dedicated Chrome remote-debugging workflow documented in
`docs/release/CWS_BROWSER_CONTROL_RUNBOOK.md`.

- Use a dedicated temporary Chrome profile and `agent-browser --cdp` after the
  Product Owner logs in.
- Do not use the Product Owner's daily Chrome profile unless explicitly
  approved for that session.
- Do not submit, publish, cancel review, withdraw review, or change release
  state without explicit Product Owner approval.
- Do not record account emails, tester accounts, cookies, tokens, passwords, or
  local user profile paths in repository evidence.
- Treat CWS pending-review locks as release-state boundaries; ask before
  canceling review or creating a replacement draft.

## 10. Approved Governance Files

| File | Purpose |
|---|---|
| `PROJECT_WORKFLOW.md` | Lightweight three-role workflow. |
| `PROJECT_MASTER.md` | Current project truth. |
| `TASK_BOARD.md` | Current task board. |
| `DECISIONS.md` | Durable decisions. |
| `docs/agents/ProductProjectMg.md` | Product&Project Mg role contract. |
| `docs/agents/BuildTest.md` | Build&Test role contract. |
| `docs/agents/ReleaseMg.md` | releaseMg role contract. |
| `docs/handoffs/HANDOFF_TEMPLATE.md` | Cross-session handoff template. |
| `docs/specs/FEATURE_SPEC_TEMPLATE.md` | Feature specification template. |
| `docs/release/RELEASE_CHECKLIST.md` | Release checklist baseline. |
| `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md` | Release gate report template. |
| `docs/release/CWS_BROWSER_CONTROL_RUNBOOK.md` | Browser-control runbook for CWS and similar authenticated store-console work. |

Do not create new governance documents when an existing authority file can hold the update.
