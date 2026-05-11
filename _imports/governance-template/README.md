# Reusable Governance Template

This directory is a project-neutral export of the multi-agent governance model used in the source project.

It is designed for a solo founder, personal project, or small-team product where AI coding agents do daily execution and the Product Owner keeps final decision authority.

## What This Template Provides

- A lightweight source-of-truth hierarchy.
- Three Codex role contracts:
  - `Product&Project Mg`
  - `Build&Test`
  - `releaseMg`
- A default lightweight workflow for routine work.
- A heavier workflow for release, privacy, security, or scope-sensitive work.
- Standard handoff, feature spec, release checklist, and release report templates.
- A clear ChatGPT / external advisor boundary.

## Files

| File | Purpose |
|---|---|
| `AGENTS_TEMPLATE.md` | Agent-wide execution rules and source-of-truth map. |
| `PROJECT_WORKFLOW_TEMPLATE.md` | Lightweight three-role workflow. |
| `PROJECT_MASTER_TEMPLATE.md` | Current project truth and release/status baseline. |
| `TASK_BOARD_TEMPLATE.md` | NOW / NEXT / LATER task board. |
| `DECISIONS_TEMPLATE.md` | Durable product, architecture, and release decisions. |
| `docs/agents/ProductProjectMg.md` | Product/project management role contract. |
| `docs/agents/BuildTest.md` | Implementation and test role contract. |
| `docs/agents/ReleaseMg.md` | Release gate and acceptance role contract. |
| `docs/handoffs/HANDOFF_TEMPLATE.md` | Cross-session handoff template. |
| `docs/specs/FEATURE_SPEC_TEMPLATE.md` | Feature specification template. |
| `docs/release/RELEASE_CHECKLIST.md` | Release checklist baseline. |
| `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md` | Release gate report template. |
| `MIGRATION_GUIDE.md` | How to adapt this package to a new project. |

## Copy Instructions

1. Copy this directory into the new project.
2. Rename `*_TEMPLATE.md` files by removing `_TEMPLATE`.
3. Replace placeholders such as `<PROJECT_NAME>`, `<PRODUCT_OWNER>`, `<RELEASE_TARGET>`, and `<DEPLOYMENT_CHANNEL>`.
4. Delete any release or platform rules that do not apply to the new project.
5. Keep role boundaries intact unless the Product Owner explicitly chooses a different model.

## Design Principle

Use the smallest durable record that keeps the next action clear.

Routine work should not create specs, handoffs, audits, or release reports by default. Formal documents are for cross-session boundaries, scope disputes, release gates, privacy/security risk, and Product Owner decisions.
