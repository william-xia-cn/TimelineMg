# Git Hygiene / Commit Plan

## Metadata

- Plan ID: GIT-HYGIENE-COMMIT-PLAN-001
- Date: 2026-05-12
- Owner: Product&Project Mg
- Current branch: `master`
- Base commit observed: `3875d82 fix: 修复 Service Worker 语法错误和 CSP inline 事件处理器违规`
- Status: Planning complete; no staging or commit performed

## Hygiene Actions Completed

- Updated `.gitignore` to ignore local/private calendar imports:
  - `*.ics`

Reason:

- The working tree contains local `.ics` files with schedule/calendar identifiers. These should not be committed.

## Do Not Commit

Exclude these local/private files:

- `*.ics`
- Any future raw local calendar/schedule exports unless explicitly redacted and approved.

Also exclude by default:

- `node_modules/`
- `package-lock.json` because the current repository `.gitignore` already ignores it and it is not currently tracked.

## Commit Strategy

Recommended branch before committing:

```text
codex/baseline-stabilization
```

Recommended commit order:

### Commit 1 - Governance Baseline

Suggested message:

```text
chore: add lightweight governance baseline
```

Include:

- `.gitignore`
- `.codex/hooks.json`
- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `_imports/governance-template/**`
- `docs/agents/**`
- `docs/handoffs/HANDOFF_TEMPLATE.md`
- `docs/specs/FEATURE_SPEC_TEMPLATE.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`

Rationale:

- Establishes the project governance rules and the imported template source before committing implementation changes.
- Includes the lightweight Codex hook because the project decided to keep it as a safety net running `node tests/scheduling.test.js`.

### Commit 2 - Internal MVP Baseline Implementation

Suggested message:

```text
feat: establish local-first MVP baseline
```

Include product implementation changes:

- `extension/manifest.json`
- `extension/background.js`
- `extension/shared/js/db.js`
- `extension/shared/js/scheduling.js`
- `extension/shared/js/sync.js`
- `extension/pages/tasks/**`
- `extension/pages/calendar/**`
- `extension/pages/focus/**`
- `extension/pages/settings/**`
- `extension/popup/**`
- deletion of `extension/shared/js/test-events.html`

Include tests:

- `tests/scheduling.test.js`
- `tests/baseline-safety.test.js`
- `tests/manual/test-events.html`

Rationale:

- Captures Build&Test MVP readiness, release blocker fix, Phase 1 corrective work, and Phase 2A safety hardening as one coherent local-first MVP baseline.
- This is a large commit, but the current working tree does not have intermediate commits, so splitting by historical phase would require careful partial staging. A single implementation baseline commit is safer.

### Commit 3 - Product Documentation Baseline

Suggested message:

```text
docs: align baseline product documentation
```

Include:

- `docs/DESIGN_v2.0.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/MODULES.md`
- `docs/TEST_PLAN.md`
- `docs/DEPLOY.md`

Rationale:

- Aligns product docs to accepted local-first Internal MVP state after implementation and safety hardening.

### Commit 4 - Governance Evidence Trail

Suggested message:

```text
docs: record baseline audit and acceptance evidence
```

Include:

- `docs/handoffs/outbox/**`
- `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_2026-05-11.md`
- `docs/release/RELEASE_GATE_REPORT_INTERNAL_MVP_RECHECK_2026-05-12.md`

Rationale:

- Preserves why the baseline exists, what was reviewed, and which risks were closed or deferred.
- Keeps evidence/history separate from the product-doc baseline commit.

## Verification Before Commit

Run before staging/committing:

```text
node tests/scheduling.test.js
node tests/baseline-safety.test.js
node --check on modified extension/test JavaScript files
git diff --check
git status --short --ignored
```

Expected:

- `node tests/scheduling.test.js`: PASS, 88/88
- `node tests/baseline-safety.test.js`: PASS, 9/9
- JS syntax checks: PASS
- `git diff --check`: PASS, LF/CRLF warnings only if any
- `.ics` files appear ignored, not untracked

## Git Actions Not Yet Approved / Not Performed

No branch creation, staging, commit, tag, push, merge, publish, deploy, upload, submit, or Chrome Web Store action was performed during this planning pass.

Product Owner should explicitly approve before:

- creating/switching branches;
- staging files;
- committing;
- pushing;
- tagging;
- merging.

## Notes

- `git status` currently emits a warning about `C:\Users\willi/.config/git/ignore` permission. This did not block repository inspection. It can be cleaned up later as a local machine configuration issue, not a project file issue.
- The working tree contains many untracked governance and test files. Do not use broad `git add .` until `.ics` ignore behavior is confirmed and the commit groups above are followed.
