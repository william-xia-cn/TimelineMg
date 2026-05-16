# Build&Test Handoff - ManageBac Mapping And Read-Only Task Sync

## Metadata

- Handoff ID: HANDOFF-MANAGEBAC-IMPORT-PLAN-001
- Created by: Product&Project Mg
- Target role: Build&Test
- Scope type: Product implementation + tests
- Status: Draft next package; do not execute until MatrixView MHTML import and Plan initialization are stable and Product Owner explicitly schedules it

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

## Goal

Implement ManageBac support as a separate package after MatrixView MHTML import / Plan initialization is stable.

This package has two different actions:

1. ManageBac subject mapping: import a ManageBac HTML file, read ManageBac subject/class configuration, and map `Subject in ManageBac` to existing TimeWhere `Subject` / planner `Plan`.
2. ManageBac task sync: configure/use the stable private `webcal://.../student/events/<token>.ics` link and convert ManageBac events into read-only Tasks whose `plan_id` points to the mapped Plan.

MatrixView is the source of TimeWhere subject Plans. ManageBac subject mapping must not create, delete, or rename subject Plans.

Current Task records already belong to Plans through `tasks.plan_id`. Read-only ManageBac behavior is not automatic in the current data layer; implementation must add explicit source metadata and write-operation protection.

If the link is unchanged, subsequent import is an update, not a new source.

## Scope

Implement:

- Settings `Plan -> 配置 ManageBac 学科映射` entry.
- Settings `Plan -> 同步 ManageBac 任务` entry, or equivalent Settings card that opens the sync page.
- Planner `My Tasks -> MyManageBac` entry:
  - dedicated ManageBac source-task view;
  - manual sync button;
  - last sync status / task count / failure reason.
- ManageBac subject mapping page with:
  - local ManageBac HTML file input;
  - `读取预览` and `重新选择`;
  - mapping status;
  - mapping table from `Subject in ManageBac` to existing TimeWhere `Subject / Plan`.
- ManageBac task sync UI using the existing Settings import-card shape:
  - private webcal/ICS subscription link input;
  - no local `.ics` file selector;
  - `保存链接`, `手动同步`, and `修改链接`;
  - sync/update status.
- Local storage of private subscription config.
- Subject mapping persistence.
- ICS fetch/read and parse.
- Conversion of ManageBac events into `tasks` records with the mapped `plan_id`.
- ManageBac source metadata for tasks.
- Read-only protection for ManageBac source Tasks in Task Board.
- Idempotent update when the link is unchanged.
- Link-change confirmation flow.

## Out Of Scope

Do not implement:

- Google Sync / OAuth.
- Arrange timetable advancement.
- Notification system.
- Chrome Web Store submission.
- Public release readiness.
- Git tag / push / merge / deploy / publish / upload / submit.

Do not write the real ManageBac token URL into repo documents, fixtures, logs, release evidence, or screenshots.

## Key Rules

- ManageBac ICS is the only fact source for ManageBac source Tasks.
- The ManageBac subscription link is configured once and reused for later manual sync; future automatic sync must reuse the same saved config unless the user changes the link.
- ManageBac task sync must not expose a local `.ics` file import choice.
- ManageBac HTML subject mapping must run after MatrixView import and subject Plan initialization.
- ManageBac mapping must use existing TimeWhere Plans only; it must not change initialized subject Plans.
- Mapping should auto-match where possible and allow manual selection adjustment.
- Clear/unmapped ManageBac subjects must not sync tasks.
- Non-academic school items may map to `Other School Plan`.
- `MyManageBac` is a source-filtered view under Planner `My Tasks`, not a subject Plan.
- Users must not directly edit or delete ManageBac source Tasks in Task Board Plan views.
- DB/UI write paths must explicitly guard ManageBac source Tasks; sync import code may update them.
- If a ManageBac event changes in ICS, local Task should update on import.
- If a ManageBac event disappears from ICS, implementation must either remove the local Task or mark it cancelled; choose one strategy and document it before implementation.
- If the subscription link changes, prompt user to confirm old source task handling.
- The link is private user data and must be stored only locally.
- Remote link sync may require narrow Chrome extension host permissions or a background fetch relay; do not broaden permissions beyond the ManageBac event subscription host/path needed for the approved feature.

## Required Tests

At minimum:

- ICS parser tests using sanitized fixtures.
- ManageBac HTML mapping parser tests using sanitized fixtures.
- Preconditions: mapping blocked when MatrixView subject Plans do not exist.
- Subject extraction / mapping tests.
- Auto-match and manual mapping adjustment tests.
- Clear/unmapped subject skip tests.
- Import creates read-only ManageBac Tasks under the correct Plan.
- Re-import with same link updates existing tasks without duplication.
- `MyManageBac` view lists ManageBac source Tasks and exposes manual sync.
- UI has no local `.ics` file input for ManageBac task sync.
- Remote `webcal://` link is normalized and fetched successfully in extension context using sanitized/mocked test data.
- Link-change path is guarded by confirmation.
- Task Board edit/delete protection for ManageBac source tasks.
- Privacy test proving real token URL is not logged or written to public fixtures.
- Existing relevant tests.
- JS syntax checks for changed JS files.
- Lightweight browser smoke for Settings and ManageBac import page.

## Deliver Back To Product&Project Mg

Return:

- Changed files.
- Behavior changes.
- Data model/storage approach.
- Tests run and results.
- Sanitized fixture strategy.
- Privacy evidence.
- Read-only task protection evidence.
- Known risks.
- Scope conformance using `Matched`, `Missing`, `Extra`, `Deviated`.
- Out-of-scope confirmation.
