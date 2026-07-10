# HANDOFF-WEBDEV-MIGRATION-2026-07-10

## Status

- Handoff type: Branch freeze and WebDev migration handoff
- Source branch: `master`
- Product code frozen SHA before handoff documentation: `ae49bb217edb7e2b4b7228da8f089a13ac7d7244`
- Target branch: `WebDev`
- Active target: WebDev / deconstruction migration planning and implementation
- Date: 2026-07-10

## Current State

`master` is treated as frozen for product feature development. Do not continue ordinary feature work directly on `master` after this handoff. New deconstruction / WebDev migration work should continue from branch `WebDev`.

The latest product-code commit before this handoff is:

```text
ae49bb2 fix: restore dashboard current task cards
```

That commit has already been pushed to `origin/master` before this handoff work.

## Current Version And Artifact Facts

- Current package / extension / desktop package version in source: `0.3.4`.
- macOS GitHub Actions artifact run used for 0.3.4: `28967678291`.
- Local mac artifact path on this machine: `artifacts/mac/28967678291/TimeWhere-0.3.4-mac-universal.zip`.
- The local `artifacts/` directory is not committed and must remain untracked unless Product Owner explicitly approves an artifact archival strategy.
- GitHub Actions macOS artifact is ad-hoc signed by electron-builder and not notarized.
- Internal macOS signing must follow `docs/release/MACOS_INTERNAL_SELF_SIGNED_RELEASE.md`.
- The Desktop macOS package contains artifact-bundled Desktop OAuth client metadata generated from `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET`; do not record the raw secret value in repo docs or logs.

## macOS Packaging And Signing Facts

The 0.3.3 and 0.3.4 GitHub Actions macOS artifacts were checked directly:

- Both were produced by `.github/workflows/timewhere-desktop-mac.yml`.
- Both logs show `falling back to ad-hoc signature for macOS application code signing`.
- Both logs show `identityName=- identityHash=none`.
- Both logs show `skipped macOS notarization`.
- Both zips include `TimeWhere.app/Contents/_CodeSignature/CodeResources`.
- `0.3.3 -> 0.3.4` did not change the mac signing/notarization configuration; it changed version/artifact names and product UI/scheduling code.

Use `platforms/desktop-electron/README.md` section `macOS GitHub Actions Packaging SOP` for future macOS GitHub Actions packaging.

## Current Untracked / Excluded Items

- `artifacts/` is local build/download output and is intentionally excluded from commit scope.
- No raw OAuth secret, token, cookie, account email, local private path, or tester account should be copied into repository evidence.

## WebDev Branch Goal

`WebDev` is for deconstruction migration work. The exact migration design must be driven by Product Owner instructions and repository authority docs. Start by reading the authority docs and this handoff, then confirm current branch and clean state before making implementation changes.

Clarification from Product Owner direction:

- The WebDev "migration" label means architecture deconstruction and migration planning, not an already-approved implementation migration plan.
- D-046 and `docs/ARCHITECTURE_DIRECTION_PROPOSAL_CLOUD_WEB_FIRST.md` define the current Architecture Direction Proposal: Cloud-first, Web-first, Desktop as Runtime, Browser Extension as ecosystem component.
- Codex should first produce technical design, migration planning, risk assessment, and implementation plan for Product Owner review.
- Google is in scope only as Google SSO / OIDC account identity for this direction. Google Drive Sync, Google Tasks, and Google Calendar integration are not designed by the direction proposal.

## Do Not Do Without Explicit Product Owner Approval

- Do not continue feature development on `master`.
- Do not tag.
- Do not create GitHub Releases.
- Do not publish, deploy, upload, submit, notarize, staple, or distribute public builds.
- Do not submit Chrome Web Store changes.
- Do not commit `artifacts/` or files containing secrets/private identifiers.
- Do not claim release readiness; Product Owner keeps final release decisions.

## Suggested Startup Prompt For The Other Machine

```text
你现在接手 TimeWhere 项目的 WebDev 解构迁移分支开发。

请先读取：
- AGENTS.md
- DECISIONS.md
- PROJECT_MASTER.md
- TASK_BOARD.md
- docs/handoffs/outbox/HANDOFF-WEBDEV-MIGRATION-2026-07-10.md

工作边界：
- 当前 master 已冻结，请不要在 master 上继续功能开发。
- 从 WebDev 分支继续。
- 不要 tag、publish、release、deploy、submit，除非 Product Owner 明确批准。
- 不要把 artifacts/ 或含 secret/private data 的文件提交到仓库。
- macOS GitHub Actions artifact 是 ad-hoc signed / not notarized；内部签名需要另走 macOS self-signed runbook。

你的第一步：
1. 确认当前分支是 WebDev。
2. 确认工作区 clean。
3. 汇报冻结 SHA、WebDev HEAD、当前未解决风险。
4. 等待或执行 Product Owner 指定的解构迁移任务。
```

## Verification Commands For Receiving Agent

```powershell
git status --branch --short
git branch --show-current
git log --oneline --decorate -5
git ls-remote origin refs/heads/master refs/heads/WebDev
rg -n "WebDev|frozen|冻结|迁移|TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET|macOS" docs/handoffs/outbox/HANDOFF-WEBDEV-MIGRATION-2026-07-10.md
```

## Known Risks / Follow-ups

- `PROJECT_MASTER.md` and `TASK_BOARD.md` still contain older version/status references in some sections. Treat `DECISIONS.md`, current git state, and current package files as source of truth for code and packaging facts until status docs are explicitly refreshed.
- The current macOS GitHub Actions package is not Developer ID signed and not notarized.
- Google Drive connector upload of the 0.3.4 mac zip failed because the file exceeds the connector 100 MB limit. Browser/manual upload or split archive upload requires separate Product Owner direction.
- The WebDev migration scope has not yet been specified in this handoff; the receiving agent must not invent a migration architecture without Product Owner approval.