# Product&Project Mg Review - MatrixView Import And Plan Initialization

## Metadata

- Review ID: REVIEW-MATRIXVIEW-IMPORT-PLAN-001
- Reviewed by: Product&Project Mg
- Source handoff: `docs/handoffs/outbox/HANDOFF-MATRIXVIEW-IMPORT-PLAN-001.md`
- Build result: returned in chat on 2026-05-12
- Review result: CHANGES REQUIRED

## Scope Reviewed

- Icon hotfix ownership result.
- MatrixView import implementation.
- MatrixView parser and sanitized fixture tests.
- MatrixView preview UI.
- Subject mapping and planner Plan initialization.
- Privacy handling evidence.
- Current status against latest Product Owner correction that Calendar events are repeatable schedule events, not merely one-time events.

## Evidence Rechecked

Commands rerun by Product&Project Mg:

- `node tests/matrixview.test.js`: PASS, 25/25.
- `node tests/scheduling.test.js`: PASS, 88/88.
- `node tests/baseline-safety.test.js`: PASS, 9/9.
- Static review of `extension/shared/js/matrixview.js`.
- Static review of `extension/pages/settings/matrixview.js`.
- Static review of `extension/pages/settings/settings.html`.
- Read-only parser count against the Product Owner supplied private StudentRecordExchange sample: `records=0`, `courses=0`, `days=0`.

No product code, test code, release action, tag, push, merge, deploy, publish, upload, or submit was performed by Product&Project Mg.

## Review Findings

### P1 - Parser Does Not Handle Supplied Real Sample

The sanitized fixture passes, but the current parser returns zero records for the actual Product Owner supplied `.mime` sample.

Evidence:

- `extension/shared/js/matrixview.js:159` parses only table/delimited rows with Day / Period / Subject-like headers.
- `extension/shared/js/matrixview.js:274` falls back from HTML table rows to delimited rows only.
- Read-only local sample parse result: `records=0`, `courses=0`, `days=0`.

Impact:

- The feature may be functionally unusable with the real exported file currently available to the Product Owner.
- The Build report's risk "unusual export layouts may need one more sanitized sample" is now confirmed against an actual supplied file.

Required Build&Test action:

- Add parser support or a clear unsupported-file error path for the actual PowerSchool `.mime` structure.
- Create a sanitized fixture derived from the real structure without private fields.
- Add tests proving the real-structure fixture parses into useful course/subject records or, if the file truly lacks MatrixView schedule data, produces an explicit "unsupported export type" message instead of silently looking like a generic import failure.

### P1 - Plan Initialization Is Destructive Without Explicit User Confirmation

`initializeSubjectPlans()` deletes known subject Plans using existing `deletePlan()`, which cascades buckets, labels, and tasks.

Evidence:

- `extension/shared/js/matrixview.js:347` calls `db.deletePlan(plan.id)`.
- Existing `TimeWhereDB.deletePlan()` cascades tasks under the Plan.
- `extension/pages/settings/matrixview.js:159` calls `initializeSubjectPlans()` directly from the button handler without a visible confirmation or deletion summary.

Impact:

- This matches the Product Owner direction to clear old subject Plans, but the UI currently performs a potentially data-destructive operation from a single button click.
- Valuable existing tasks under old subject Plans could be deleted without a final warning.

Required Build&Test action:

- Before executing Plan rebuild, present a confirmation summary that includes:
  - subject Plans to be deleted/rebuilt;
  - clearly preserved non-subject Plans;
  - uncertain Plans left untouched;
  - warning that tasks under deleted subject Plans will be deleted.
- Continue to keep the operation idempotent after confirmation.

### P2 - Calendar Copy Still Says Imported Timetable Becomes One-Time Schedule Events

The Product Owner corrected that Calendar event counterparts are schedule events and may repeat, not merely one-time events.

Evidence:

- `extension/pages/settings/settings.html:133` still says imported timetable will be added as `单次日程事件`.

Impact:

- User-facing copy conflicts with the latest corrected product model.

Required Build&Test action:

- Update user-facing copy to avoid "single/one-time event" wording.
- Use wording aligned with current docs, such as "导入的课表将作为日程事件添加到日历（不影响时间容器）".

## Positive Conformance

- Settings now has a MatrixView Plan entry.
- MatrixView import page exists.
- File selection and import button exist.
- Two preview tabs exist: `View By A-H Day` and `View By Subject`.
- `View By Subject` has editable internal `Subject` and preserves `Subject in MatrixView`.
- Import storage uses existing `settings` keys and avoids schema migration.
- Tests cover sanitized parser, privacy strings, subject extraction, Plan initialization, `Other School Plan`, non-subject Plan preservation, uncertain Plan reporting, and idempotence.
- Icon coverage result appears reasonable based on Build&Test evidence.
- No out-of-scope release/deploy/sync/subscription action was reported or observed.

## Correction Recheck - 2026-05-12

Build&Test returned a narrow correction pass. Product&Project Mg rechecked:

- `node tests/matrixview.test.js`: PASS, 36/36.
- `node tests/scheduling.test.js`: PASS, 88/88.
- `node tests/baseline-safety.test.js`: PASS, 9/9.
- `node --check extension/shared/js/matrixview.js`: PASS.
- `node --check extension/pages/settings/matrixview.js`: PASS.
- `node --check extension/pages/settings/script.js`: PASS.
- `node --check tests/matrixview.test.js`: PASS.
- Read-only parse of root-local private StudentRecordExchange sample: `parse_status=unsupported`, `export_type=powerschool_student_record_exchange`, `unsupported_reason=unsupported_export_type`, `records=0`, `courses=0`, `days=0`.
- Privacy scan across `docs`, `extension`, and `tests`: no real private sample fields found. The only remaining reference is this review document's mention of the sample filename/path purpose.

Correction result:

- P1 real sample handling: PASS. The supplied real sample is now explicitly classified as unsupported StudentRecordExchange rather than silently producing a generic empty import.
- P1 destructive Plan rebuild confirmation: PASS. UI now previews delete/rebuild, preserved, and uncertain Plans and warns that tasks/buckets/labels under deleted subject Plans will be deleted.
- P2 Calendar copy: PASS. User-facing copy no longer says imported timetable becomes a one-time schedule event.

Remaining hygiene risk:

- The private StudentRecordExchange `.mime` sample is still present as an untracked file in the repository root.
- `.gitignore` currently ignores `*.ics` but not `*.mime`.
- This private sample must not be staged or committed. Before git staging/commit, move it outside the repo or add an approved ignore rule.

## Review Decision

Functionally accepted by Product&Project Mg for the MatrixView implementation package, subject to private sample hygiene before commit.

Do not send to releaseMg for public release readiness. This is internal feature implementation review only.

Required before git commit:

1. Ensure the private StudentRecordExchange `.mime` sample is not staged.
2. Move/delete the private sample from the repository root, or add an approved ignore rule for local private `.mime` samples.

## PDF Correction Review - 2026-05-12

Build&Test returned `HANDOFF-MATRIXVIEW-PDF-CORRECTION-001` implementation. Product&Project Mg rechecked:

- `node tests/matrixview.test.js`: PASS, 41/41.
- `node tests/scheduling.test.js`: PASS, 88/88.
- `node tests/baseline-safety.test.js`: PASS, 9/9.
- `node --check extension/shared/js/matrixview.js`: PASS.
- `node --check extension/pages/settings/matrixview.js`: PASS.
- `node --check tests/matrixview.test.js`: PASS.

Real PDF structural parse, counts only:

- `parse_status=ok`
- `export_type=matrixview_schedule`
- `records=47`
- `courses=12`
- `days=1`
- Day distribution: all parsed records are assigned to one day.

Review result: CHANGES REQUIRED.

Reason:

- The implementation proves that browser-local PDF text extraction can produce records and courses.
- However, `View By A-H Day` requires A-H Day distribution. Parsing the real PDF into `days=1` means day reconstruction is still incorrect for the confirmed input file.
- Current sanitized fixture is line-based and easier than the real PDF layout, so it does not catch this failure mode.

Required Build&Test correction:

1. Improve real PDF day/layout reconstruction so the confirmed PDF produces multiple A-H Day groups, expected A-H coverage where present in the source.
2. Add a sanitized fixture that reflects the real PDF extracted-text structure closely enough to catch the `all records assigned to one day` failure.
3. Add a test assertion that parsed PDF text includes multiple distinct A-H days, not merely nonzero days.
4. Keep StudentRecordExchange `.mime` explicit unsupported behavior.
5. Keep Plan initialization confirmation behavior unchanged.

Do not send to releaseMg.

## PDF Day Reconstruction Recheck - 2026-05-12

Build&Test returned a narrow correction for PDF day reconstruction. Product&Project Mg rechecked:

- `node tests/matrixview.test.js`: PASS, 44/44.
- `node tests/scheduling.test.js`: PASS, 88/88.
- `node tests/baseline-safety.test.js`: PASS, 9/9.
- `node --check extension/shared/js/matrixview.js`: PASS.
- `node --check extension/pages/settings/matrixview.js`: PASS.
- `node --check tests/matrixview.test.js`: PASS.

Real PDF structural parse, counts only:

- `parse_status=ok`
- `export_type=matrixview_schedule`
- `records=73`
- `courses=19`
- `days=8`
- Day distribution: `A=11`, `B=10`, `C=9`, `D=9`, `E=11`, `F=7`, `G=7`, `H=9`.

Review result: SUPERSEDED BY CHANGES REQUIRED.

Notes:

- The prior `all records assigned to one day` failure is resolved.
- The sanitized PDF-structure fixture now covers the `(<Day>)D<Period>` extracted-text pattern.
- This remains an internal feature implementation review, not releaseMg acceptance or public release readiness.

Remaining hygiene risk before commit:

- The private MatrixView PDF sample is still present as an untracked private sample in the repository root.
- It must not be staged or committed. Move it outside the repo or add an approved ignore rule before git staging.

## Import UX And PDF Text Quality Review - 2026-05-12

Product Owner reported two blocking issues after trying the Chrome extension page:

1. Import has no clear in-progress state while parsing/saving.
2. PDF fallback parsing can treat unreadable binary/gibberish output as valid MatrixView records and render it into the preview.

Review result: CHANGES REQUIRED.

Required Build&Test correction:

- Add visible import state transitions on the MatrixView page:
  - idle / waiting for file;
  - parsing file;
  - saving parsed import;
  - success with record/course/day counts;
  - failed with clear reason.
- Disable the import button during parsing/saving and restore it after completion/failure.
- Reject PDF parse output when subject/course text is not human-readable enough to be trusted.
- Do not save `matrixview_import` when parsing quality fails.
- Show a user-facing failure message instead of rendering gibberish preview rows.
- Add regression tests covering unreadable PDF fallback text being rejected.
- Add a browser smoke or equivalent UI verification proving import progress/status is visible.

This blocks MatrixView import acceptance. Do not send to releaseMg.

## Import Source Strategy Correction - 2026-05-12

Product Owner supplied the correct MatrixView export source:

- `[REDACTED_LOCAL_PRIVATE_MATRIXVIEW_MHTML_SAMPLE]`
- Saved by Blink from `[REDACTED_PRIVATE_POWERSCHOOL_MATRIXVIEW_URL]`
- Contains the PowerSchool MatrixView page snapshot and should preserve DOM/table structure better than PDF.

Product&Project Mg decision:

- Stop treating PDF as the formal MatrixView import source.
- Do not continue hardening the hand-written PDF parser for product use.
- Use MHTML/HTML as the formal local-first MatrixView import source.
- PDF may be rejected as unsupported/unreliable unless Product Owner separately approves a mature local PDF parser dependency.
- Import remains separate from Plan initialization.

Required Build&Test refactor:

- Rebuild MatrixView parser around `.mhtml` / `.html` DOM table extraction.
- Decode Blink MHTML quoted-printable HTML part locally in browser-compatible code.
- Parse the actual MatrixView table structure, not rendered PDF text.
- Default `Subject` to the full extracted `Subject in MatrixView` value for academic subject rows; do not auto-simplify.
- Clearly non-academic school rows may default to `Other School Plan` as an initial suggestion, but user edits take precedence.
- Treat user-cleared empty `Subject` as "do not initialize this row into any Plan".
- Add structure validation before saving:
  - A-H day coverage where present in source;
  - expected period columns / schedule blocks;
  - readable subject text;
  - teacher and room extraction where present;
  - no gibberish rows.
- Do not save failed/low-quality imports.
- Do not initialize Plan during import.
- Keep StudentRecordExchange `.mime` explicit unsupported.
- Reject PDF as unsupported/unreliable for now, with clear user-facing status.
- Build sanitized MHTML/HTML fixture from the supplied file's structure only; do not copy private names, identifiers, account data, or raw sample content.

This supersedes PDF parser correction work as the implementation direction.

## MHTML Refactor Product&Project Mg Review - 2026-05-13

Build&Test completed the MatrixView MHTML refactor. Product&Project Mg rechecked:

- `node tests/matrixview.test.js`: PASS, 59/59.
- `node tests/scheduling.test.js`: PASS, 88/88.
- `node tests/baseline-safety.test.js`: PASS, 9/9.
- `node --check extension/shared/js/matrixview.js`: PASS.
- `node --check extension/pages/settings/matrixview.js`: PASS.
- `node --check tests/matrixview.test.js`: PASS.

Real private MHTML sample structural parse, counts only:

- Source: root-local private MatrixView MHTML sample.
- `parse_status=ok`.
- `export_type=matrixview_schedule`.
- `records=48`.
- `courses=13`.
- `days=8`.
- Periods: `1`, `2`, `3`, `4`, `CT`, `DRM`.

Review result: CHANGES REQUIRED.

Blocking finding:

1. PDF still appears as selectable input in the UI.
   - `extension/pages/settings/matrixview.html` still allows `.pdf` in the file input accept list.
   - Product Owner decision superseded PDF as a formal source. The page should guide users to `.mhtml/.html`; PDF may be rejected defensively if somehow selected, but it should not be advertised as an accepted file type.
   - Required correction: remove `.pdf` from the visible accepted file types and add/keep defensive unsupported handling in code/tests.

Non-blocking note:

- `Dorm Checking Night` currently defaults to `Dorm Checking Night` rather than `Other School Plan`.
- Product Owner clarified this is acceptable. Defaulting clear non-subject rows to `Other School Plan` is a suggestion, not a forced classification.
- User edits take precedence. If the user clears `Subject`, that MatrixView row must not participate in Plan initialization.

Positive conformance:

- MHTML/HTML DOM-table parsing replaces PDF as the accepted formal path.
- Real MHTML parses into the expected 6x8 / 48-record structure with A-H coverage.
- PDF parser path is now explicit unsupported rather than attempting unreliable extraction.
- Academic Subject defaults to full `Subject in MatrixView`.
- Empty edited Subject rows are skipped during Plan initialization.
- `Other School Plan` remains a single idempotent Plan target.

Do not send to releaseMg. This is still implementation review, not release readiness.

## MHTML Visible Input Cleanup Recheck - 2026-05-13

Build&Test returned the narrow visible input cleanup. Product&Project Mg rechecked:

- `node tests/matrixview.test.js`: PASS, 59/59.
- `node tests/scheduling.test.js`: PASS, 88/88.
- `node tests/baseline-safety.test.js`: PASS, 9/9.
- `node --check extension/pages/settings/matrixview.js`: PASS.
- `node --check extension/shared/js/matrixview.js`: PASS.
- `node --check tests/matrixview.test.js`: PASS.
- Static check of `extension/pages/settings/matrixview.html`: `matrixFileInput` accept list is `.mhtml,.mht,.html,.htm`; `.pdf` is no longer present.

Review result: FUNCTIONALLY ACCEPTED.

Notes:

- PDF remains defensively unsupported in code/tests, but is no longer advertised as an accepted MatrixView input.
- Subject mapping behavior was not changed. `Dorm Checking Night` remains user-adjustable and is not a blocker. User-cleared `Subject` rows must still be skipped during Plan initialization.
- This remains implementation review only, not releaseMg acceptance or public release readiness.

Remaining hygiene risk before commit:

- The private MatrixView MHTML and PDF samples are still present as untracked private samples in the repository root.
- They must not be staged or committed.

## Import Button No-Op Recheck - 2026-05-12

Build&Test returned a narrow correction for the MatrixView import button no-op report. Product&Project Mg rechecked:

- `node tests/matrixview.test.js`: PASS, 44/44.
- `node tests/scheduling.test.js`: PASS, 88/88.
- `node tests/baseline-safety.test.js`: PASS, 9/9.
- `node --check extension/shared/js/matrixview.js`: PASS.
- `node --check extension/pages/settings/matrixview.js`: PASS.
- `node --check extension/pages/settings/script.js`: PASS.

Build&Test browser smoke evidence reviewed:

- Settings `导入 MatrixView 课表` button is visible and navigates to `matrixview.html`.
- MatrixView import without selecting a file shows a visible status message instead of no-op.
- Browser import of root-local private MatrixView PDF sample completes with visible preview data: `records=31`, `courses=28`, `days=8`.
- StudentRecordExchange `.mime` sanitized fixture still shows explicit unsupported messaging.
- Browser smoke reported no page or console errors.

Review result: FUNCTIONALLY ACCEPTED.

Notes:

- The no-op class is addressed by binding click handlers before asynchronous initialization and by showing visible status on initialization/import errors.
- The browser PDF fallback produces lower counts than the Node full extraction path, but it restores visible import success and A-H day preview in the actual browser path. Treat higher-fidelity PDF extraction as a separate parser-quality improvement, not a blocker for this no-op fix.
- This remains an internal feature implementation review, not releaseMg acceptance or public release readiness.

Remaining hygiene risk before commit:

- The private MatrixView PDF sample is still present as an untracked private sample in the repository root.
- It must not be staged or committed. Move it outside the repo or add an approved ignore rule before git staging.
