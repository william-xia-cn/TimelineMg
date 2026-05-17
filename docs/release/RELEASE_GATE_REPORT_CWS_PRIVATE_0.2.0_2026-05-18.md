# Release Gate Report - CWS Private 0.2.0

## Metadata

- Report ID: `REL-CWS-PRIVATE-0.2.0-2026-05-18`
- Date: 2026-05-18
- Release/deployment target: Chrome Web Store Private testing material readiness
- Candidate version: `0.2.0`
- Candidate branch: `master`
- Candidate commit: `6a95c88` plus uncommitted working-tree changes
- Package/artifact path: `dist/TimeWhere-0.2.0-private-cws-20260518-011449.zip`
- Package/artifact SHA256: `62DCB492E94CC0D20E6BB690906A4246024C9741D6FC049766CC5AE6780F95BF`
- Prepared by: releaseMg
- Status: Ready for Product Owner decision with risk acceptance required

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

## Execution Scope

| Item | Value |
|---|---|
| Production environment used | No |
| Test environment used | Local Chrome/Playwright profile only |
| Destructive actions allowed | No |
| Config changes allowed | No |
| Cloud/database writes allowed | No |
| Publish/deploy/submit allowed | No; D-023 approves material preparation only |

## Gate Results

| Gate | Result | Evidence summary | Notes |
|---|---|---|---|
| Preflight | PASS_WITH_MANUAL_EVIDENCE | D-023 added; target is `0.2.0` CWS Private material preparation. | Actual upload/submit/publish remains unapproved. |
| Artifact verification | PASS_WITH_MANUAL_EVIDENCE | Zip created from `extension/*`; root `manifest.json` present; manifest version `0.2.0`; required icons present; SHA256 recorded. | Source commit is not a complete identity because worktree is dirty. |
| Automated tests | PASS | `npm test` completed successfully under `timewhere@0.2.0`. | Full suite passed. |
| Manual acceptance | PASS_WITH_MANUAL_EVIDENCE | Playwright headed Chromium loaded unpacked candidate; extension ID `ogdjmelmfkfahppahhkkggdejjainbnd`; popup title `TimeWhere`; clean screenshots captured. | No real Google auth or real ManageBac URL was used. |
| CWS listing/material readiness | PASS_WITH_MANUAL_EVIDENCE | Store listing, privacy text, permission explanations, distribution draft, reviewer instructions, screenshots, and promo image prepared. | Product Owner must paste/confirm final dashboard fields. |
| Documentation consistency | PASS_WITH_MANUAL_EVIDENCE | `DECISIONS.md`, `PROJECT_MASTER.md`, and `TASK_BOARD.md` updated for D-023 and `0.2.0` material preparation. | Historical reports remain unchanged. |
| Evidence privacy | PASS_WITH_MANUAL_EVIDENCE | Zip filename scan found no private sample names; content scan found no private key/client secret/password/cookie/local profile/private sample strings. `access_token` / `refresh_token` hits are code setting keys and null/clear logic only. | Evidence screenshots use a fresh profile and show no private account or school identifiers. |

## Acceptance Test Results

| Case | Result | Evidence | Notes |
|---|---|---|---|
| Full automated suite | PASS | `npm test` | Scheduling, Focus, Calendar, Task Board, ManageBac, management review, MatrixView, reminders, Daily Journal, baseline safety passed. |
| Package root and manifest | PASS | Zip inspection | `manifest.json` is at zip root; version is `0.2.0`. |
| Required CWS image assets | PASS | PNG dimension check | Screenshots are 1280x800; promo is 440x280; icon is 128x128. |
| Unpacked extension load | PASS_WITH_MANUAL_EVIDENCE | Playwright headed Chromium | Service worker loaded with fixed extension ID; popup page opened with title `TimeWhere`. |
| Privacy scan | PASS_WITH_MANUAL_EVIDENCE | Zip/extract scan | No credential/private sample filenames; no secret token values observed. |
| CWS policy minimum-permission review | PASS_WITH_MANUAL_EVIDENCE | Manifest and source search | Permissions are mapped to current implemented features in submission materials. |

## Failed Items

- None in executed gates.

## Blockers

| Blocker ID | Severity | Owner role | Description | Required next action |
|---|---|---|---|---|
| REL-CWS-TRACE-001 | Medium | Product Owner / Build&Test | Artifact was generated from a dirty working tree, so `6a95c88` alone does not identify the exact submitted source. | Approve commit/staging path before any upload/submit, or explicitly accept this local-source traceability risk. |
| REL-CWS-SUBMIT-001 | High | Product Owner | Actual Chrome Web Store upload / Submit for Review is not approved by D-023. | Give explicit approval before any dashboard upload or Submit for Review action. |
| REL-CWS-OAUTH-001 | Medium | Product Owner / Build&Test | Google OAuth depends on the extension ID matching `ogdjmelmfkfahppahhkkggdejjainbnd`. | Confirm the CWS item ID after upload; if it differs, update OAuth client configuration before Google sync testing. |

## Waivers And Deferrals

| Item | State | Reason | Approved by |
|---|---|---|---|
| Real Google auth smoke | DEFERRED | Requires a test Google account and CWS/OAuth environment confirmation; no private account data should enter repo evidence. | Product Owner pending |
| Real ManageBac subscription smoke | DEFERRED | Requires a private school subscription URL; no private URL should enter repo evidence. | Product Owner pending |

## Evidence Files

- `dist/TimeWhere-0.2.0-private-cws-20260518-011449.zip`
- `docs/release/CWS_PRIVATE_SUBMISSION_MATERIALS_0.2.0_2026-05-18.md`
- `docs/release/cws-assets/0.2.0-private/01-focus-dashboard.png`
- `docs/release/cws-assets/0.2.0-private/02-task-board.png`
- `docs/release/cws-assets/0.2.0-private/03-settings.png`
- `docs/release/cws-assets/0.2.0-private/small-promo-440x280.png`

## Known Risks

- Candidate source traceability remains open until the dirty working tree is committed/staged or explicitly accepted by Product Owner.
- CWS Private visibility still goes through Chrome Web Store review and must satisfy the same policy requirements as other visibility settings.
- Google Drive sync review may require live test-account validation after CWS item ID is confirmed.
- Trusted tester emails and any Developer Dashboard account details must remain outside repository evidence.

## Release Readiness Recommendation

`READY ONLY WITH PRODUCT OWNER RISK ACCEPTANCE`

The `0.2.0` Private CWS material package is prepared and the executed local gates passed. Product Owner must still decide whether to accept the dirty-worktree source traceability risk or require a commit/staging pass before upload. Product Owner must also explicitly approve any actual Chrome Web Store upload / Submit for Review.

## Product Owner Decision Required

- Decide whether to commit/stage the `0.2.0` candidate source before CWS upload.
- Decide whether to approve Chrome Web Store Developer Dashboard upload.
- Decide whether to approve Submit for Review after dashboard fields are filled.
- Configure trusted testers in the Developer Dashboard without recording tester emails in repo evidence.

## Privacy Check

Evidence contains no private user identifier, token, cookie, password, account email, private screenshot, local profile path, raw profile identifier, real ManageBac subscription URL, or private school export sample.
