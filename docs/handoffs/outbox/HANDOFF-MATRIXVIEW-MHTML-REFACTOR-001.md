# Handoff: MatrixView MHTML Import Refactor

## Metadata

- Handoff ID: HANDOFF-MATRIXVIEW-MHTML-REFACTOR-001
- From: Product&Project Mg
- To: Build&Test
- Date: 2026-05-12
- Status: Ready for Build&Test

## Read First

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `TASK_BOARD.md`
- `docs/handoffs/outbox/REVIEW-MATRIXVIEW-IMPORT-PLAN-001.md`
- `docs/MODULES.md`
- `extension/pages/settings/matrixview.html`
- `extension/pages/settings/matrixview.js`
- `extension/shared/js/matrixview.js`
- `tests/matrixview.test.js`

## Context

The previous PDF parsing approach is no longer accepted. The issue is not just field extraction. PDF text extraction produced character-map errors, block merging, and unreadable rows. It must not be used as the formal source for MatrixView import or Plan initialization.

Product Owner supplied the correct private local MatrixView MHTML source file:

- `[REDACTED_LOCAL_PRIVATE_MATRIXVIEW_MHTML_SAMPLE]`

This file is a Blink-saved MHTML snapshot of the private PowerSchool MatrixView page:

- `[REDACTED_PRIVATE_POWERSCHOOL_MATRIXVIEW_URL]`

Use it only as a local read-only sample. Do not commit it or copy private content into fixtures, tests, docs, or code.

## Goal

Refactor MatrixView import to use PowerSchool MatrixView `.mhtml` / `.html` DOM/table extraction as the formal import path.

## Scope

In scope:

- MatrixView import parser.
- MatrixView import page status/progress behavior.
- MatrixView tests and sanitized fixtures.
- UI copy that describes accepted file types.

Out of scope:

- ManageBac import.
- Google Sync/OAuth.
- Remote API fetch.
- Arrange / automatic scheduling.
- Notification system.
- Chrome Web Store / public release.
- Git tag / push / merge / deploy / publish / upload / submit.
- Plan initialization during import.

## Required Behavior

### Import Source Policy

- `.mhtml` / `.html` from PowerSchool MatrixView is the formal supported input.
- PDF must be rejected as unsupported/unreliable for now, unless Product Owner separately approves a mature local PDF parser dependency.
- StudentRecordExchange `.mime` remains explicit unsupported.

### Import Flow

The `导入` button must:

1. Read the selected local `.mhtml` / `.html` file.
2. Decode the MHTML HTML part when needed.
3. Extract records from DOM/table structure.
4. Validate parsed structure and readability.
5. Save parsed import data only if validation passes.
6. Render `View By A-H Day` and `View By Subject`.

The `导入` button must not:

- initialize Plan;
- delete Plan;
- create buckets;
- write task data;
- save failed/low-quality parse output.

Plan initialization remains only under:

- `保存并初始化学科 Plan 数据`

### UI Status

Add visible status transitions:

- waiting / idle;
- parsing selected file;
- validating parsed structure;
- saving parsed import;
- success with records / courses / days counts;
- failure with clear reason.

During parsing/saving:

- disable import button;
- prevent duplicate clicks;
- restore controls after completion/failure.

### MHTML / HTML Parsing Requirements

Build browser-compatible local parsing. No remote service.

For MHTML:

- extract the `text/html` part;
- decode quoted-printable content;
- respect declared UTF-8;
- parse with `DOMParser`;
- ignore CSS/images/scripts and unrelated MHTML parts.

For HTML:

- parse directly with `DOMParser`.

For MatrixView table extraction:

- identify the MatrixView schedule table from structure/content, not private names;
- extract A-H day rows where present;
- extract period columns and schedule blocks;
- extract subject text, teacher, room, terms when present;
- preserve `subject_in_matrixview`;
- default editable internal `subject` to the full extracted `subject_in_matrixview` value, not to an automatically shortened abbreviation;
- avoid gibberish rows.

### Subject Mapping Rules

`View By Subject` must show two separate fields:

- `Subject`: TimeWhere internal Plan/subject target, editable by the user.
- `Subject in MatrixView`: full original MatrixView course text, read-only for traceability.

Default mapping rules:

- For clear academic subjects, set `Subject` to the full extracted `Subject in MatrixView` text.
- Do not auto-simplify by default. The user may manually simplify names later.
- For rows that are clearly school-related but not academic subjects, the parser may default `Subject` to `Other School Plan` as an initial suggestion.
- Examples of likely non-subject rows include community time, dorm checking, advisory/homeroom style rows, or other non-academic school schedule blocks.
- User edits take precedence over any default suggestion.
- If the user clears `Subject` to an empty value, that MatrixView course/block must be excluded from Plan initialization.
- Empty `Subject` rows may remain visible in preview and stored for traceability, but must not create/update/delete Plans.
- `Other School Plan` rows should map to the existing/single `Other School Plan` Plan during initialization.
- Plan initialization must only create subject Plans for non-empty `Subject` values other than `Other School Plan`.

### Validation Requirements

Before saving, validate:

- A-H day coverage is present where source contains it;
- parsed records are nonzero;
- parsed course count is plausible;
- subject text is readable human text;
- records do not contain obvious PDF/binary gibberish;
- schedule records have day and period or an explicit supported equivalent.

If validation fails:

- do not save `matrixview_import`;
- do not enable Plan initialization;
- show a clear user-facing error.

## Tests Required

Run and report:

- `node tests/matrixview.test.js`
- `node tests/scheduling.test.js`
- `node tests/baseline-safety.test.js`
- `node --check extension/shared/js/matrixview.js`
- `node --check extension/pages/settings/matrixview.js`

Add or update tests for:

- Blink MHTML quoted-printable HTML part extraction.
- HTML DOM table parsing from sanitized MatrixView structure.
- Valid MHTML/HTML parse creates records, courses, and A-H day groups.
- Default `Subject` equals the full `Subject in MatrixView` for academic subject rows.
- Clear non-subject school rows may default to `Other School Plan` as an initial suggestion, but user edits take precedence.
- Empty edited `Subject` rows are skipped during Plan initialization and do not create Plans.
- `Other School Plan` mapping creates/uses only the single `Other School Plan`.
- PDF input is rejected as unsupported/unreliable.
- StudentRecordExchange `.mime` remains explicit unsupported.
- Bad/unreadable parse output is not saved.
- Import does not call Plan initialization.
- Plan initialization still works from a valid imported mapping.

Sanitized fixture rules:

- Create sanitized `.mhtml` or `.html` fixture only from structure.
- Replace all real student, teacher, room, account, token, school-private, and identifying values with fake values.
- Do not copy the real private MatrixView MHTML sample into `tests/fixtures`.

## Browser Smoke Required

Run a browser smoke against the MatrixView import page and report:

- selecting sanitized MHTML/HTML and clicking import shows in-progress status;
- import button is disabled while import runs;
- successful import shows counts and renders both tabs;
- PDF input shows unsupported/unreliable message and does not render gibberish;
- Plan initialization button is enabled only after valid import;
- importing does not initialize Plan by itself;
- no console/page errors.

## Deliver

Return to Product&Project Mg with:

- changed files;
- root cause and strategy change summary;
- exact parser behavior;
- validation rules implemented;
- tests run and results;
- browser smoke evidence;
- confirmation that import does not initialize Plan;
- confirmation that PDF is not used as formal source;
- privacy evidence for real sample handling;
- remaining risks;
- out-of-scope confirmation.
