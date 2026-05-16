# HANDOFF-ICON-HOTFIX-001

## To

Build&Test

## From

Product&Project Mg

## Date

2026-05-12

## Task Type

Product code review / narrow hotfix ownership transfer.

## Context

Product&Project Mg incorrectly edited product code directly while responding to a user-reported UI issue:

```text
导航栏顶部图标错误，请修正
```

This was a role-boundary deviation. Product&Project Mg should have triaged and assigned the work to Build&Test instead of modifying `extension/shared/js/icons.js` directly.

Current uncommitted product-code diff:

- `extension/shared/js/icons.js`

There is also an unrelated project-tooling diff:

- `.codex/hooks.json` was changed to clear Codex hooks after Product Owner requested removal of the hook review blocker.

## Read First

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `docs/agents/BuildTest.md`
- `extension/shared/js/icons.js`
- affected pages using Material icon spans:
  - `extension/pages/focus/focus.html`
  - `extension/pages/tasks/tasks.html`
  - `extension/pages/calendar/calendar.html`
  - `extension/pages/settings/settings.html`
  - `extension/popup/popup.html`

## Goal

Take ownership of the current `extension/shared/js/icons.js` hotfix diff and decide whether to keep, adjust, or replace it.

The user-visible issue is that top navigation / brand icons render incorrectly after remote Google Fonts were removed from extension pages. The immediate known cause is missing local SVG mappings for Material icon names such as `change_history`.

## Scope

Allowed:

- Review the current `extension/shared/js/icons.js` diff.
- Keep or refine local SVG mappings needed by current MVP pages.
- Limit changes to icon rendering / mapping only unless a directly related page reference must be corrected.
- Run minimal relevant checks.

Preferred scope:

- `extension/shared/js/icons.js`

Possible affected files only if necessary:

- `extension/pages/*/*.html`
- `extension/popup/popup.html`

## Out Of Scope

Do not:

- Modify data model, DB schema, sync, scheduling, task behavior, calendar behavior, or settings behavior.
- Re-enable Google Fonts or other remote icon/font dependencies.
- Add public release, CWS, tag, push, deploy, publish, upload, or submit work.
- Modify `.codex/hooks.json` unless explicitly asked; that tooling change is separate from this product-code handoff.
- Commit unless Product Owner explicitly approves.

## Acceptance Criteria

- Top navigation / brand icon no longer renders as raw text or wrong glyph.
- Static Material icon references used by current MVP pages have local SVG mappings or are intentionally deferred with explanation.
- No remote Google Fonts dependency is reintroduced.
- Product-code ownership is restored to Build&Test.
- Changed files, behavior changes, tests, and residual risks are reported back to Product&Project Mg.

## Required Checks

Run at minimum:

```powershell
node --check extension/shared/js/icons.js
node tests/baseline-safety.test.js
```

Recommended static check:

```text
Scan extension HTML/JS for static `<span class="material-symbols-outlined">...</span>` names and confirm they are represented in `ICONS`.
```

If browser validation is available, perform a narrow visual smoke:

- Focus navigation / logo
- Tasks navigation / logo
- Calendar navigation / logo
- Settings navigation / logo
- Popup logo/actions

## Deliverables

- Decision: keep / adjust / replace the current `icons.js` diff.
- Changed files list.
- Test/check results.
- Confirmation that Google Fonts were not reintroduced.
- Any remaining icon names not covered and why.
- Explicit no release / CWS / tag / push / deploy confirmation.

