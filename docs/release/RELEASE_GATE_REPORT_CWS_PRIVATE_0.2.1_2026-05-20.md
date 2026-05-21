# Release Gate Report - CWS Private 0.2.1 Purple Potassium Fix

## Metadata

- Report ID: `REL-CWS-PRIVATE-0.2.1-PURPLE-POTASSIUM-2026-05-20`
- Date: 2026-05-20
- Release/deployment target: Chrome Web Store Private testing resubmission
- Candidate version: `0.2.1`
- CWS policy violation reference ID: `Purple Potassium`
- Candidate branch: `master`
- Candidate commit: pending current working tree commit
- Package/artifact path: `dist/TimeWhere-0.2.1-private-cws-sanitized-20260520-214913.zip`
- Package/artifact SHA256: `258CED7F544D8953A883EC01E28B6BF87691A9592D7AC2A2FA95B13D32F7DF23`
- Prepared by: releaseMg
- Status: Submitted to CWS review; dashboard status verified as pending review

## Source Documents

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/CWS_PRIVATE_SUBMISSION_MATERIALS_0.2.1_2026-05-20.md`

## Execution Scope

| Item | Value |
|---|---|
| Production environment used | Chrome Web Store Developer Dashboard |
| Test environment used | Lightweight local package verification |
| Destructive actions allowed | Cancel current CWS review only, approved by Product Owner for this resubmission |
| Config changes allowed | CWS draft package replacement and resubmission |
| Cloud/database writes allowed | No |
| Publish/deploy/submit allowed | Submit for Review approved; automatic publish after review not approved |

## Gate Results

| Gate | Result | Evidence summary | Notes |
|---|---|---|---|
| Preflight | PASS_WITH_MANUAL_EVIDENCE | D-025 approves `0.2.1` Purple Potassium policy-fix resubmission. | Product Owner selected lightweight verification. |
| Policy fix | PASS | Source manifest permissions are `identity`, `identity.email`, `alarms`, `notifications`, `storage`, `unlimitedStorage`; no `tabs`. | `chrome.tabs.create()` remains only for opening extension pages/notification targets. |
| Artifact verification | PASS | Sanitized CWS zip regenerated; root `manifest.json` present; manifest version `0.2.1`; manifest `key` absent; `tabs` absent; SHA256 recorded. | Package path recorded in metadata. |
| Minimum-permission consistency audit | PASS_WITH_MANUAL_EVIDENCE | Each submitted permission/host permission was mapped to current source usage and implemented features. | `tabs` is intentionally removed; `chrome.tabs.create()` does not require the `tabs` permission. |
| Automated tests | WAIVED | Product Owner selected lightweight verification, not full `npm test`. | Do not record this as full test pass. |
| CWS resubmission | PASS_WITH_MANUAL_EVIDENCE | Fixed `0.2.1` package uploaded to the existing CWS item and submitted for review; dashboard status verified as pending review. | Automatic publish after review was disabled before submission. |
| Evidence privacy | PASS_WITH_MANUAL_EVIDENCE | Zip scan found no private key/client secret/password/cookie/local profile/private sample strings. `access_token` / `refresh_token` hits are setting-key defaults/exclusions/clear logic only. | No secret token values observed. |

## Acceptance Test Results

| Case | Result | Evidence | Notes |
|---|---|---|---|
| Source manifest version and permissions | PASS | Manifest parse | Version is `0.2.1`; permissions do not include `tabs`. |
| `chrome.tabs` usage review | PASS_WITH_MANUAL_EVIDENCE | Source search | Usage is limited to `chrome.tabs.create()` in background/popup open-page paths. |
| Package root and manifest | PASS | Zip inspection | `manifest.json` is at zip root. |
| CWS manifest key restriction | PASS | Zip inspection | Submitted package manifest has no `key`. |
| CWS tabs permission restriction | PASS | Zip inspection | Submitted package manifest has no `tabs`. |
| Minimum-permission consistency | PASS_WITH_MANUAL_EVIDENCE | Manifest/source audit | See permission audit table below. |
| Privacy scan | PASS_WITH_MANUAL_EVIDENCE | Zip/extract scan | No credential/private sample filenames or secret values; token keyword hits are code keys/nulling logic only. |

## Minimum-Permission Consistency Audit

| Manifest item | Source evidence | Current feature need | Result |
|---|---|---|---|
| `identity` | `extension/shared/js/google-sync.js` uses `chrome.identity.getAuthToken()` and `clearAllCachedAuthTokens()`. | Optional Google Drive appDataFolder sync auth. | PASS |
| `identity.email` | `extension/shared/js/google-sync.js` uses `chrome.identity.getProfileUserInfo()`. | Optional display/confirmation of the Google account bound to sync. | PASS |
| `alarms` | `extension/background.js` uses `chrome.alarms.create()`, `get()`, `getAll()`, and `onAlarm`. | Local task reminders and daily journal reminder/snapshot scheduling. | PASS |
| `notifications` | `extension/background.js` uses `chrome.notifications.create()` and `onClicked`. | Local task reminders, daily journal prompts, and manual test notifications. | PASS |
| `storage` | `extension/background.js` uses `chrome.storage.local` for reminder diagnostic/sent state. | Small extension runtime/reminder state. | PASS |
| `unlimitedStorage` | `extension/shared/js/db.js` uses Dexie/IndexedDB for local-first tasks, plans, events, settings, journal/sync metadata, and imported schedule data. | Local-first planner data can exceed ordinary small-extension storage expectations. | PASS_WITH_MANUAL_EVIDENCE |
| `https://managebac.com/student/events/*` | `extension/background.js` fetches user-provided ManageBac ICS links after validating HTTPS ManageBac `.com` / `.cn` root or subdomain hosts and `/student/events/` paths. | Covers root ManageBac `.com` events links accepted by the current validator. | PASS |
| `https://*.managebac.com/student/events/*` | Same as above. | Covers ManageBac `.com` school subdomain events links accepted by the current validator. | PASS |
| `https://managebac.cn/student/events/*` | Same as above. | Covers root ManageBac China events links accepted by the current validator. | PASS |
| `https://*.managebac.cn/student/events/*` | Same as above. | Covers ManageBac China school subdomain events links accepted by the current validator. | PASS |
| `https://www.googleapis.com/drive/v3/*` | `extension/shared/js/google-sync.js` reads Drive file metadata/content using Drive v3 URLs with `spaces=appDataFolder`. | Optional appDataFolder metadata lookup and download for TimeWhere sync. | PASS |
| `https://www.googleapis.com/upload/drive/v3/*` | `extension/shared/js/google-sync.js` uploads/patches the sync JSON through Drive upload endpoints. | Optional appDataFolder upload for TimeWhere sync. | PASS |
| `tabs` | Source still uses `chrome.tabs.create()` in `background.js` and `popup.js`, but source/submitted manifests no longer request `tabs`. | Opening extension-owned pages from popup/notifications does not require the `tabs` permission. | PASS |

Notes:

- ManageBac host permissions now match the current source validator while staying path-restricted to `/student/events/*`.
- No future-only permission was identified in the submitted manifest during this audit.

## CWS Dashboard Evidence

- Existing CWS item was updated with `dist/TimeWhere-0.2.1-private-cws-sanitized-20260520-214913.zip`.
- CWS accepted the draft package as version `0.2.1`.
- CWS package permissions no longer include `tabs`.
- Privacy host-permission reason was updated to match ManageBac `.com` / `.cn` root and school subdomain `/student/events/` host permissions plus optional Google Drive appDataFolder sync.
- Submit for Review completed and CWS displayed the confirmation that the extension was submitted for review.
- Final status page showed the item status as pending review.
- Automatic publish after review was left disabled.

## Failed Items

- None yet.

## Blockers

- None yet.

## Waivers And Deferrals

| Item | State | Reason | Approved by |
|---|---|---|---|
| Full automated `npm test` | WAIVED | Product Owner selected lightweight verification for CWS policy-fix resubmission. | Product Owner |
| Browser/unpacked smoke | WAIVED | Product Owner selected lightweight verification. | Product Owner |
| Automatic publish after CWS review | DEFERRED | Not approved for this resubmission. | Product Owner |

## Evidence Files

- `docs/release/CWS_PRIVATE_SUBMISSION_MATERIALS_0.2.1_2026-05-20.md`
- `dist/TimeWhere-0.2.1-private-cws-sanitized-20260520-214913.zip`

## Known Risks

- Full automated tests and browser smoke are waived for this CWS policy-fix resubmission.
- CWS-sanitized upload package strips manifest `key`; Google OAuth must be rechecked if CWS item ID differs from the local fixed development ID.
- After this submission, current source moved ahead with Chrome `sidePanel` permission and Side Panel / quick-add UI. Those changes are not part of the uploaded CWS package recorded in this report; a future CWS update must regenerate package and permission evidence.
- Trusted tester emails and any Developer Dashboard account details must remain outside repository evidence.

## Release Readiness Recommendation

`SUBMITTED TO CWS REVIEW`

The `0.2.1` CWS policy-fix package has passed lightweight verification for the Purple Potassium finding and has been submitted to CWS review. Automatic publish after review remains unapproved and was disabled during submission.

## Privacy Check

Evidence contains no private user identifier, token value, cookie, password, account email, private screenshot, local profile path, raw profile identifier, real ManageBac subscription URL, or private school export sample.
