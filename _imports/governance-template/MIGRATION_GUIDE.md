# Migration Guide

Use this guide to adapt the governance template to a new project.

## 1. Copy Files

Copy the template directory into the new project root, then move or rename files:

```text
AGENTS_TEMPLATE.md -> AGENTS.md
PROJECT_WORKFLOW_TEMPLATE.md -> PROJECT_WORKFLOW.md
PROJECT_MASTER_TEMPLATE.md -> PROJECT_MASTER.md
TASK_BOARD_TEMPLATE.md -> TASK_BOARD.md
DECISIONS_TEMPLATE.md -> DECISIONS.md
docs/agents/* -> docs/agents/*
docs/handoffs/HANDOFF_TEMPLATE.md -> docs/handoffs/HANDOFF_TEMPLATE.md
docs/specs/FEATURE_SPEC_TEMPLATE.md -> docs/specs/FEATURE_SPEC_TEMPLATE.md
docs/release/* -> docs/release/*
```

## 2. Replace Placeholders

Search for:

- `<PROJECT_NAME>`
- `<PRODUCT_OWNER>`
- `<PROJECT_STAGE>`
- `<CURRENT_VERSION>`
- `<CURRENT_STAGE>`
- `<RELEASE_TARGET>`
- `<CURRENT_CONSTRAINT>`
- `<DEPLOYMENT_CHANNEL>`
- `<SCOPE_ITEM_*>`
- `<OUT_OF_SCOPE_ITEM_*>`

Replace them with new project facts.

## 3. Decide Project Weight

Pick one:

| Mode | Use when |
|---|---|
| Lightweight | Personal project, prototype, small internal tool, solo founder. |
| Standard | Small team, recurring releases, moderate production risk. |
| Strict | Regulated, customer-facing, data-sensitive, or multi-team product. |

The default template is `Lightweight`.

## 4. Customize ReleaseMg

Replace generic gates with project-specific gates.

Examples:

- Chrome extension: package hash, manifest, browser profile, store dashboard.
- Web app: deployment URL, migration status, auth smoke, rollback plan.
- API service: schema migration, health checks, logs, canary, rollback.
- Mobile app: build number, store upload, device smoke, privacy labels.

Keep these rules:

- releaseMg does not fix bugs;
- releaseMg does not lower standards;
- releaseMg recommends readiness, Product Owner decides;
- publish/deploy/submit requires explicit Product Owner approval.

## 5. Keep ChatGPT As Advisor

Do not make ChatGPT the daily project manager by default.

Use it for:

- architecture review;
- major product decisions;
- release blocker disputes;
- process design;
- second opinions.

Let the three Codex roles handle routine execution.

## 6. Do Not Copy Source-Project Evidence

Do not copy old project-specific files into a new project:

- old release reports;
- old audit reports;
- old handoff instances;
- old decisions;
- old package hashes;
- old store/dashboard records;
- old production profile notes.

Only copy templates and general role contracts.

## 7. First Setup Checklist

- [ ] Create root governance docs.
- [ ] Create `docs/agents/` role contracts.
- [ ] Create `docs/handoffs/`, `docs/specs/`, `docs/release/`.
- [ ] Fill `PROJECT_MASTER.md` with current project facts.
- [ ] Fill `TASK_BOARD.md` with current NOW/NEXT/LATER.
- [ ] Add initial `DECISIONS.md` entries.
- [ ] Decide whether release/deployment work needs a strict `releaseMg` SOP.
- [ ] Confirm Product Owner final decision authority.
