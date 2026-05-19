# Release Gate Report - CWS Private 0.2.0

## Metadata

- Report ID: `REL-CWS-PRIVATE-0.2.0-2026-05-18`
- Date: 2026-05-18
- Release/deployment target: Chrome Web Store Private testing material readiness
- Candidate version: `0.2.0`
- Historical note: current source/package version has moved to `0.2.1` for internal stabilization; this report remains evidence for the historical `0.2.0` CWS Private package only.
- Candidate branch: `master`
- Candidate commit: `753ac44`
- Package/artifact path: `dist/TimeWhere-0.2.0-private-cws-sanitized-20260519-012614.zip`
- Package/artifact SHA256: `4A77450F9378185B9269A42453EF848939EF745037A3FC9155E0E60F9C8E7D3B`
- Prepared by: releaseMg
- Status: Ready for Product Owner decision with test-waiver risk acceptance required

## Source Documents

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/CWS_PRIVATE_SUBMISSION_MATERIALS_0.2.0_2026-05-18.md`
- Build&Test implementation report: not a new handoff for this releaseMg pass; current working tree contains pre-existing uncommitted Build&Test/Product changes.
- Product&Project Mg conformance review: Product Owner directly approved CWS Private material preparation via D-023; no separate conformance handoff was created.
- Regeneration note: Product Owner instructed releaseMg to regenerate release/CWS materials without tests.

## Execution Scope

| Item | Value |
|---|---|
| Production environment used | No |
| Test environment used | No tests run for regenerated package |
| Destructive actions allowed | No |
| Config changes allowed | No |
| Cloud/database writes allowed | No |
| Publish/deploy/submit allowed | No; D-023 approves material preparation only |

## Gate Results

| Gate | Result | Evidence summary | Notes |
|---|---|---|---|
| Preflight | PASS_WITH_MANUAL_EVIDENCE | D-023 remains active; target is `0.2.0` CWS Private material preparation. | Actual upload/submit/publish remains unapproved. |
| Artifact verification | PASS_WITH_MANUAL_EVIDENCE | Zip regenerated from latest `extension/*` via a CWS staging copy; root `manifest.json` present; manifest version `0.2.0`; manifest `key` absent; required icons present; SHA256 recorded. | Candidate commit is clean HEAD `753ac44`; source manifest still keeps `key` for local fixed-ID OAuth testing. |
| Automated tests | WAIVED | Product Owner instructed: "不用测试了". | No `npm test` run for this regenerated package. |
| Manual acceptance | WAIVED | Product Owner instructed no testing. | No browser/unpacked-extension smoke run for this regenerated package. |
| CWS listing/material readiness | PASS_WITH_MANUAL_EVIDENCE | Store listing, privacy text, permission explanations, distribution draft, reviewer instructions, screenshots, and promo image remain prepared; artifact/hash refreshed. | Product Owner must paste/confirm final dashboard fields. |
| Documentation consistency | PASS_WITH_MANUAL_EVIDENCE | `DECISIONS.md`, `PROJECT_MASTER.md`, and `TASK_BOARD.md` updated for D-023 and `0.2.0` material preparation. | Historical reports remain unchanged. |
| Evidence privacy | PASS_WITH_MANUAL_EVIDENCE | Zip filename scan found no private sample names; content scan found no private key/client secret/password/cookie/local profile/private sample strings. `access_token` / `refresh_token` hits are code setting keys and null/clear logic only. | Evidence screenshots use a fresh profile and show no private account or school identifiers. |

## Acceptance Test Results

| Case | Result | Evidence | Notes |
|---|---|---|---|
| Full automated suite | WAIVED | Product Owner instruction | Tests were not run for the regenerated package. |
| Package root and manifest | PASS | Zip inspection | `manifest.json` is at zip root; version is `0.2.0`. |
| CWS manifest key restriction | PASS_WITH_MANUAL_EVIDENCE | Zip inspection | Submitted package manifest has no `key` field. |
| Required CWS image assets | PASS | PNG dimension check | Screenshots are 1280x800; promo is 440x280; icon is 128x128. |
| Unpacked extension load | WAIVED | Product Owner instruction | Browser smoke was not run for the regenerated package. |
| Privacy scan | PASS_WITH_MANUAL_EVIDENCE | Zip/extract scan | No credential/private sample filenames; no secret token values observed. |
| CWS policy minimum-permission review | PASS_WITH_MANUAL_EVIDENCE | Manifest and source search | Permissions are mapped to current implemented features in submission materials. |

## Failed Items

- None in executed gates.

## Blockers

| Blocker ID | Severity | Owner role | Description | Required next action |
|---|---|---|---|---|
| REL-CWS-SUBMIT-001 | High | Product Owner | Actual Chrome Web Store upload / Submit for Review is not approved by D-023. | Give explicit approval before any dashboard upload or Submit for Review action. |
| REL-CWS-OAUTH-001 | Medium | Product Owner / Build&Test | Google OAuth currently depends on the local fixed development extension ID `ogdjmelmfkfahppahhkkggdejjainbnd`, but CWS upload packages cannot include manifest `key`. | Confirm the CWS-assigned item ID after upload; if it differs, update OAuth client configuration before Google sync testing. |
| REL-CWS-TEST-001 | Medium | Product Owner / releaseMg | Regenerated package did not receive automated or browser smoke tests. | Product Owner must accept this waiver/risk before any upload/submit. |

## Waivers And Deferrals

| Item | State | Reason | Approved by |
|---|---|---|---|
| Automated test run for regenerated package | WAIVED | Product Owner instructed releaseMg not to test. | Product Owner |
| Browser/unpacked smoke for regenerated package | WAIVED | Product Owner instructed releaseMg not to test. | Product Owner |
| Real Google auth smoke | DEFERRED | Requires a test Google account and CWS/OAuth environment confirmation; no private account data should enter repo evidence. | Product Owner pending |
| Real ManageBac subscription smoke | DEFERRED | Requires a private school subscription URL; no private URL should enter repo evidence. | Product Owner pending |

## Evidence Files

- `dist/TimeWhere-0.2.0-private-cws-sanitized-20260519-012614.zip`
- `docs/release/CWS_PRIVATE_SUBMISSION_MATERIALS_0.2.0_2026-05-18.md`
- `docs/release/cws-assets/0.2.0-private/01-focus-dashboard.png`
- `docs/release/cws-assets/0.2.0-private/02-task-board.png`
- `docs/release/cws-assets/0.2.0-private/03-settings.png`
- `docs/release/cws-assets/0.2.0-private/small-promo-440x280.png`

## Known Risks

- Automated and browser tests were waived for the regenerated package by Product Owner instruction.
- CWS-sanitized upload package strips manifest `key`; Google OAuth must be rechecked after CWS item ID is known.
- CWS Private visibility still goes through Chrome Web Store review and must satisfy the same policy requirements as other visibility settings.
- Google Drive sync review may require live test-account validation after CWS item ID is confirmed.
- Trusted tester emails and any Developer Dashboard account details must remain outside repository evidence.

## Release Readiness Recommendation

`READY ONLY WITH PRODUCT OWNER RISK ACCEPTANCE`

The regenerated `0.2.0` Private CWS material package is prepared from clean HEAD `753ac44`, and package/privacy/material checks passed. Automated tests and browser smoke were intentionally not run per Product Owner instruction, so Product Owner must accept that risk before any Chrome Web Store upload / Submit for Review.

## Product Owner Decision Required

- Accept or reject the no-test waiver for the regenerated `0.2.0` package.
- Decide whether to approve Chrome Web Store Developer Dashboard upload.
- Decide whether to approve Submit for Review after dashboard fields are filled.
- Configure trusted testers in the Developer Dashboard without recording tester emails in repo evidence.

## Privacy Check

Evidence contains no private user identifier, token, cookie, password, account email, private screenshot, local profile path, raw profile identifier, real ManageBac subscription URL, or private school export sample.
