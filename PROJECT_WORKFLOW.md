# PROJECT_WORKFLOW

## Lightweight Three-Role Workflow

TimeWhere uses a lightweight three-role Codex workflow.

Default principle:

```text
Use the smallest durable record that keeps the next action clear.
Do not create handoff, audit, spec, or release-report files by default.
```

Heavy governance is reserved for release/deployment gates, scope disputes, dirty worktree confusion, security/privacy-sensitive work, production data risk, or role-boundary conflicts.

## Roles

1. `Product&Project Mg`
2. `Build&Test`
3. `releaseMg`

Collaboration rule:

```text
Codex sessions do not rely on memory for important facts.
For routine work, update PROJECT_MASTER.md / TASK_BOARD.md / DECISIONS.md only as needed.
Use formal handoff documents only when a separate session genuinely needs bounded instructions or evidence.
```

## External Advisor Boundary

ChatGPT or any external advisor is the Product Owner's advisor, architecture reviewer, and decision-support partner.

It is not the daily project manager. It does not own daily Codex scheduling, ordinary bugfix routing, routine prompt generation, routine test-failure debugging, implementation details, release step-by-step operation, or daily task-board maintenance.

Escalate only for:

- product model changes;
- uncertain architecture decisions;
- storage, sync, statistics, security, privacy, or permission model changes;
- disputed release/deployment blocker classification;
- role-boundary conflict;
- suspected scope violation;
- Product Owner needs a second opinion;
- major release-risk review.

## Mandatory Role Contracts

- `docs/agents/ProductProjectMg.md`
- `docs/agents/BuildTest.md`
- `docs/agents/ReleaseMg.md`

These documents are mandatory operating contracts, not suggestions.

## Role Boundary Table

| Work item | Product&Project Mg | Build&Test | releaseMg |
|---|---:|---:|---:|
| Requirement clarification | Owner | No | No |
| Functional specs | Owner | Read only | Read only |
| Architecture plan | Review owner | Implementation owner | Risk check |
| Code implementation | Forbidden | Owner | Forbidden |
| Unit tests | Defines requirements | Owner | Evidence sampling |
| Integration tests | Defines requirements | Owner | Evidence sampling / rerun |
| Black-box acceptance | Designs cases | Supports fixes | Owner |
| Release/deployment gates | Defines standards | Provides evidence | Owner |
| Documentation sync | Owner | Implementation reports / required technical docs only | Release reports |
| Remote/deployment state judgment | Evidence review only | Forbidden as final judgment | Must verify, no memory-based judgment |
| Final release/deployment decision | Product Owner | Forbidden | Recommendation only |

## Small / Routine Work

Use for small bugfixes, copy tweaks, focused tests, ordinary docs sync, and local follow-ups.

```text
Product Owner
-> relevant Codex role
-> concise result report
-> update TASK_BOARD.md / PROJECT_MASTER.md only if durable status changed
```

Defaults:

- no new spec file;
- no handoff file;
- no audit file;
- no release report;
- no external-advisor escalation;
- tests limited to the smallest relevant set for code changes.

## Medium Work

Use when a change touches multiple files, product behavior, storage, sync, permissions, security, or user-visible workflows.

Minimum durable record:

- short task/spec section in an existing doc, or a spec file only when scope needs it;
- Build&Test result report with changed files, behavior changes, tests, and risks;
- `TASK_BOARD.md` update when durable status changes.

Formal handoff is optional and should be used only when another session cannot safely continue from current docs and a concise chat summary.

## Release / High-Risk Work

Use for releases, deployments, production profile/data, package identity, privacy/security, cloud/database changes, app-store submission, or blocker disputes.

Minimum durable record:

- release checklist or readiness report;
- blocker/risk table;
- Product Owner decisions;
- private-data redaction notes when evidence includes screenshots, accounts, production state, or user data.

## Heavy Workflow Escape Hatch

Use only when risk justifies it:

```text
Product Owner
-> Product&Project Mg
-> Build&Test
-> Product&Project Mg review
-> releaseMg acceptance
-> Product Owner release decision
```

## Handoff Storage

Use:

- `docs/handoffs/HANDOFF_TEMPLATE.md`
- `docs/handoffs/inbox/`
- `docs/handoffs/outbox/`
- `docs/handoffs/archive/`

Do not paste long chat logs into handoffs. Link source documents and summarize only necessary context.

Create a formal handoff only when:

- another Codex session needs bounded instructions;
- scope or permission boundaries are easy to misunderstand;
- release/deployment evidence must be preserved;
- a blocker or waiver needs durable tracking;
- Product Owner explicitly asks for it.
