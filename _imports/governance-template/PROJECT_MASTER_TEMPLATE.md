# PROJECT_MASTER

## Project Status

- **Project**: `<PROJECT_NAME>`
- **Version**: `<CURRENT_VERSION>`
- **Stage**: `<CURRENT_STAGE>`
- **Active release/deployment target**: `<RELEASE_TARGET>`
- **Current constraint**: `<CURRENT_CONSTRAINT>`

## Collaboration Model

- **Status**: Lightweight three-role collaboration baseline established.
- **Project type**: `<PERSONAL / SMALL_TEAM / COMMERCIAL / INTERNAL_TOOL>`
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

- `<SCOPE_ITEM_1>`
- `<SCOPE_ITEM_2>`
- `<SCOPE_ITEM_3>`

### Out Of Scope

- `<OUT_OF_SCOPE_ITEM_1>`
- `<OUT_OF_SCOPE_ITEM_2>`
- `<OUT_OF_SCOPE_ITEM_3>`

## Release / Deployment State

| Item | Status |
|---|---|
| Candidate version | `<VERSION>` |
| Candidate commit | `<COMMIT_OR_BRANCH>` |
| Package/artifact | `<PATH_OR_N/A>` |
| Artifact hash | `<SHA_OR_N/A>` |
| Deployment channel | `<DEPLOYMENT_CHANNEL>` |
| Review status | `<PENDING / APPROVED / REJECTED / N/A>` |
| Public release | `<NOT_STARTED / BLOCKED / READY_FOR_PO_DECISION / SHIPPED>` |
| Tag | `<NOT_APPROVED / APPROVED / DONE>` |

## Known Risks

| Risk | State | Owner | Notes |
|---|---|---|---|
| `<RISK>` | `<OPEN / WAIVED / DEFERRED / ACCEPTED / CLOSED>` | `<OWNER>` | `<NOTES>` |

## Current Evidence

- `<EVIDENCE_FILE_OR_SUMMARY>`

## Product Owner Decisions Needed

1. `<DECISION_NEEDED>`
