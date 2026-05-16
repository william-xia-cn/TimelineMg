# Build&Test Handoff - MatrixView Import And Subject Plan Initialization

## Metadata

- Handoff ID: HANDOFF-MATRIXVIEW-IMPORT-PLAN-001
- Created by: Product&Project Mg
- Target role: Build&Test
- Scope type: Product implementation + tests
- Release scope: Internal local-first feature work only

## Read First

- `AGENTS.md`
- `docs/agents/BuildTest.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/MODULES.md`
- `docs/DATA_MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_PLAN.md`
- Relevant current implementation under:
  - `extension/pages/settings/`
  - `extension/pages/tasks/`
  - `extension/shared/js/db.js`
  - `extension/shared/js/scheduling.js`
  - `tests/`

## Precondition

Before starting this feature, Build&Test should resolve or take ownership of the existing `extension/shared/js/icons.js` hotfix diff tracked by `HANDOFF-ICON-HOTFIX-001.md`. Do not mix unrelated icon ownership work into the MatrixView implementation report.

## Goal

Implement the MatrixView / PowerSchool local import path and subject Plan initialization workflow defined in `docs/MODULES.md` and `docs/DATA_MODEL.md`.

The user flow:

1. User opens `Settings -> Plan -> 导入 MatrixView 课表`.
2. User selects a MatrixView / PowerSchool exported file.
3. User clicks `导入`.
4. System parses the file and saves the extracted MatrixView timetable data locally.
5. System displays two preview tabs:
   - `View By A-H Day`
   - `View By Subject`
6. In `View By Subject`, user can review and edit internal `Subject` values.
7. User clicks `保存并初始化学科 Plan 数据`.
8. System saves the `Subject` / `Subject in MatrixView` mapping and initializes planner Plans.

## Scope

Implement:

- Settings `Plan` section with:
  - `导入 MatrixView 课表` entry.
  - `导入 ManageBac 日历` entry may remain disabled / future-only.
- MatrixView import page or view reachable from Settings.
- File selection and `导入` button.
- Local `.mime` parsing sufficient for PowerSchool / MatrixView exported data.
- Local storage of extracted MatrixView timetable/course data.
- Privacy filtering: save only fields required for timetable/course planning.
- `View By A-H Day` preview.
- `View By Subject` preview.
- Editable internal `Subject` column in `View By Subject`.
- Persistent `Subject` / `Subject in MatrixView` mapping.
- `保存并初始化学科 Plan 数据` button.
- Planner Plan initialization:
  - Clear/rebuild old school subject Plans.
  - Preserve clearly non-subject Plans such as `其它计划`, `大学申请`, `Personal`, `Projects`.
  - Do not auto-delete uncertain Plans; ask for confirmation or leave them untouched.
  - Ensure `Other School Plan` exists.
  - Create default buckets for each new subject Plan: `Homework`, `Test`, `IA / EE`, `Notes`, `Review`, `Project`, `Other`.
  - Ensure operation is idempotent.

## Out Of Scope

Do not implement:

- ManageBac subscription.
- Google Sync / OAuth.
- Remote API fetch.
- Arrange timetable advancement.
- Automatic task scheduling from timetable data.
- Notification system.
- Chrome Web Store submission.
- Public release readiness.
- Git tag / push / merge / deploy / publish / upload / submit.

Do not save:

- Student addresses.
- Phone numbers.
- account identifiers.
- personal demographic data.
- raw full `.mime` content.
- any unrelated private fields from the export.

## Implementation Guidance

Prefer a small, local-first design.

Suggested structure:

- Add a MatrixView import page under `extension/pages/settings/` or another existing page convention.
- Add parsing/storage helpers in a focused module rather than embedding all parsing inside UI event handlers.
- Store extracted data in IndexedDB using an explicit local model.
- If a Dexie schema change is required, keep it minimal and add migration-safe tests.
- If avoiding schema migration is cleaner for this first pass, storing normalized import records/mappings under `settings` keys is acceptable only if the structure remains testable and documented in the implementation report.
- Use existing `TimeWhereDB.addPlan`, `updatePlan`, `deletePlan`, `addBucket`, and related planner APIs where possible.
- Reuse existing escaping/rendering helpers for all imported text.

Subject extraction defaults:

- Default internal `Subject` is derived from `Subject in MatrixView`.
- Use conservative rules, for example:
  - `Math: Analysis...` -> `Math`
  - `English B Language...` -> `English`
  - `Chinese A Literature...` -> `Chinese`
  - `Computer Science...` -> `Computer Science`
  - `Theory of Knowledge` / `TOK` -> `TOK`
- If no confident subject is found, use `Other` or require user edit before Plan initialization.

Plan cleanup rules:

- Delete/rebuild Plans known to be MatrixView-managed subject Plans.
- Delete/rebuild Plans with `plan.subject` set.
- Delete/rebuild Plans whose names clearly match known school subjects.
- Preserve clearly non-subject Plans.
- For uncertain Plan names, do not silently delete.

## Acceptance Criteria

- Settings has a clear Plan section and opens the MatrixView import page.
- User can select a `.mime` file and click `导入`.
- Import action parses and saves normalized local timetable/course data.
- Import does not save unrelated private personal fields from the source file.
- `View By A-H Day` renders a MatrixView-style preview.
- `View By Subject` renders:
  - editable internal `Subject`;
  - read-only or traceable `Subject in MatrixView`;
  - teacher, room, A-H Day / Period distribution when available.
- `保存并初始化学科 Plan 数据` saves mappings and initializes planner Plans.
- Existing school subject Plans are rebuilt according to the current mapping.
- `Other School Plan` is created if missing and not duplicated if present.
- Clearly non-subject Plans are preserved.
- Repeating the initialization does not create duplicate Plans or duplicate default buckets.
- No Google Sync, ManageBac subscription, Arrange advancement, notification, CWS, or public release behavior is introduced.

## Required Tests

At minimum:

- Parser unit tests for the supported `.mime` format using sanitized fixtures.
- Privacy test proving irrelevant personal fields are not persisted.
- Subject extraction tests.
- Plan initialization tests:
  - creates subject Plans;
  - creates `Other School Plan`;
  - creates default buckets;
  - preserves non-subject Plans;
  - handles uncertain Plans safely;
  - idempotent repeated run.
- Existing tests:
  - `node tests/scheduling.test.js`
  - `node tests/baseline-safety.test.js`
- JS syntax checks for changed JS files.

If UI is changed, also perform a lightweight browser smoke for:

- Settings page loads.
- MatrixView import page loads.
- Import page can render previews from a sanitized fixture.

## Deliver Back To Product&Project Mg

Return:

- Changed files.
- Behavior changes.
- Data model/storage approach.
- Tests run and results.
- Sanitized fixture strategy.
- Privacy evidence.
- Plan initialization evidence.
- Known risks.
- Scope conformance using `Matched`, `Missing`, `Extra`, `Deviated`.
- Confirmation that no out-of-scope release/deploy/sync/subscription actions were performed.

