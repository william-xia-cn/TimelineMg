# Build&Test Handoff - MatrixView PDF Input Correction

## Metadata

- Handoff ID: HANDOFF-MATRIXVIEW-PDF-CORRECTION-001
- Created by: Product&Project Mg
- Target role: Build&Test
- Scope type: Narrow implementation correction + tests

## Read First

- `AGENTS.md`
- `docs/agents/BuildTest.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/handoffs/outbox/HANDOFF-MATRIXVIEW-IMPORT-PLAN-001.md`
- `docs/handoffs/outbox/REVIEW-MATRIXVIEW-IMPORT-PLAN-001.md`
- `docs/MODULES.md`
- `docs/DATA_MODEL.md`
- `docs/TEST_PLAN.md`

## Goal

Correct the MatrixView import implementation to support the now-confirmed real input format:

```text
[REDACTED_LOCAL_PRIVATE_MATRIXVIEW_PDF_SAMPLE]
```

Product&Project Mg verified this PDF contains the PowerSchool Matrix View schedule text, including:

- `myschedulematrix.html`
- `Day Terms 1 2 3 4 CT DRM`
- A-H Day rows
- course names
- course codes
- teachers
- rooms
- period/day occurrence strings

The earlier private StudentRecordExchange `.mime` file is not the target MatrixView input; it is correctly classified as unsupported StudentRecordExchange.

## Scope

Implement support for MatrixView PDF import:

- Accept `.pdf` in the MatrixView import page file picker.
- Parse a MatrixView PDF exported from PowerSchool into normalized MatrixView records.
- Preserve the existing behavior for supported table-like fixtures.
- Preserve unsupported classification for StudentRecordExchange `.mime`.
- Keep the existing two preview tabs:
  - `View By A-H Day`
  - `View By Subject`
- Keep existing Subject mapping and Plan initialization behavior.
- Keep the destructive Plan initialization confirmation.
- Update tests and sanitized fixtures.

## Important Implementation Constraint

The current extension runs in the browser. Do not rely on local CLI tools such as `pdftotext` at runtime.

Build&Test must choose and document one of:

1. A browser-compatible local PDF text extraction approach bundled with the extension, or
2. A Product&Project Mg review blocker explaining why PDF support requires adding a local PDF parser dependency / user-side export alternative.

Do not use network PDF parsing or remote services.

## Private Sample Rules

The real PDF is private local user data.

- Do not commit the real private MatrixView PDF sample.
- Do not copy it into `tests/fixtures`.
- Do not paste real student names, private profile data, or full raw text into reports.
- Use it only locally and read-only to understand structure.
- Create sanitized fixture(s) with fake course names, teachers, rooms, Day/Period values, and no private personal data.
- Final report may include only counts and structural classification, such as `records=N`, `courses=N`, `days=N`.

## Acceptance Criteria

- User can choose a `.pdf` file in the MatrixView import page.
- A sanitized MatrixView PDF/text fixture parses into nonzero records/courses/days.
- The real local private MatrixView PDF sample is either:
  - parsed locally into nonzero counts, or
  - blocked by a documented technical limitation that requires Product Owner approval for a PDF parser dependency or alternate export format.
- The private StudentRecordExchange `.mime` sample remains explicitly unsupported.
- No raw private sample is saved in settings, fixtures, docs, logs, or reports.
- Existing Plan initialization confirmation and idempotence remain intact.

## Required Tests

At minimum:

- `node tests/matrixview.test.js`
- `node tests/scheduling.test.js`
- `node tests/baseline-safety.test.js`
- `node --check` on changed JS files.
- PDF fixture parser test using sanitized data.
- Privacy/static scan proving private sample names/fields are not present in repo files.
- Lightweight MatrixView page smoke if UI changes.

## Out Of Scope

Do not implement:

- ManageBac.
- Google Sync/OAuth.
- Remote API fetch.
- Arrange.
- Automatic scheduling.
- Notifications.
- CWS/public release.
- tag/push/merge/deploy/publish/upload/submit.

Do not modify `.codex/hooks.json`.

## Deliver Back To Product&Project Mg

Return:

- Changed files.
- PDF support approach.
- Real PDF structural parse result counts only.
- Sanitized fixture strategy.
- Tests run and results.
- Privacy evidence.
- Known risks.
- Scope conformance.
- Out-of-scope confirmation.
