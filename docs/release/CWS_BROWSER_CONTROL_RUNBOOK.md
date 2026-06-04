# CWS Browser Control Runbook

This runbook records the preferred browser-control mode for Chrome Web Store
and similar authenticated store-console work.

## Purpose

Use this flow when an agent needs to operate an authenticated browser page that
requires the Product Owner's account session, such as:

- Chrome Web Store Developer Dashboard draft edits.
- Chrome Web Store package or image uploads.
- Store listing, privacy, distribution, and tester configuration pages.
- Similar vendor dashboards where authenticated state and file upload support
  are both important.

## Preferred Mode

Preferred mode: dedicated Chrome profile with a remote debugging port, controlled
by `agent-browser --cdp`.

Why:

- It uses a real visible Chrome window that the Product Owner can log into.
- It gives the agent a stable CDP connection after login.
- It supports `agent-browser upload`, which is useful for CWS package and image
  file fields.
- It avoids relying on extension script injection on pages that block it, such
  as Chrome Web Store pages.
- It avoids using the Product Owner's daily Chrome profile directly.

## Setup

Start a dedicated Chrome instance with a separate temporary user data directory:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="<TEMP>\timewhere-cws-chrome-profile" `
  "https://chrome.google.com/webstore/devconsole/"
```

Then:

1. Product Owner logs into the required dashboard in that visible Chrome window.
2. Agent connects to it:

```powershell
agent-browser --cdp 9222 --session timewhere-cws-cdp snapshot -i -u
```

3. Agent verifies current state from live page output before acting.

If the browser is not already listening on `9222`, verify with:

```powershell
Invoke-RestMethod http://127.0.0.1:9222/json/version
```

If the request is refused, start the dedicated Chrome profile again. If Google
shows an identity verification page, the Product Owner must complete login or
2FA in the visible Chrome window; the agent must not enter credentials,
verification codes, or account recovery details.

## Reusable CWS Submission Flow

Use this sequence for CWS updates in any project:

1. Verify the local upload zip before opening CWS:
   - zip root contains `manifest.json`;
   - `manifest.version` is higher than the currently published CWS version;
   - CWS package manifest has no `key` field;
   - permissions match the intended release;
   - package scan has no secrets, cookies, tokens, private samples, or local
     profile paths.
2. Open the item package page and compare CWS draft/published package metadata
   with the local artifact.
3. If CWS already has an accepted draft that can be published, publish or
   discard it only after explicit Product Owner approval. CWS will reject a new
   upload with the same manifest version as the already published package.
4. Upload the new zip. If upload succeeds, CWS usually returns to an edit page;
   re-open the package page and confirm the draft version and permissions.
5. Open Privacy and fill any new permission reason fields introduced by the
   manifest, for example `sidePanel`.
6. Save draft and verify the Submit for Review button becomes enabled.
7. Submit for review. If an auto-publish checkbox appears, set it exactly as
   approved by Product Owner.
8. Confirm the final status page. Expected successful review-submission state is
   `待审核` / pending review.

For private testing, configure trusted tester access in publisher settings or
the CWS distribution controls as applicable. Do not record tester emails or
private account identifiers in repository evidence.

## Operating Rules

- Do not record account emails, tester accounts, cookies, tokens, passwords, or
  local user profile paths in repository evidence.
- Do not use the Product Owner's daily Chrome profile unless explicitly
  approved for that session.
- Do not submit, publish, deploy, cancel review, withdraw review, or otherwise
  change release state without explicit Product Owner approval.
- If CWS shows an auto-publish option during review submission, disable it
  unless the Product Owner explicitly approves automatic publish after review.
- Prefer snapshots before and after each meaningful page-changing action.
- Use quoted refs in PowerShell commands, for example `click '@e44'`, because
  unquoted `@...` can be interpreted by PowerShell.
- Treat "pending review" or other locked states as release-state boundaries.
  If editing requires canceling review or creating a new draft, stop and ask for
  explicit approval.
- Treat "ready to publish" as a release-state boundary too. Publishing an
  accepted old draft may be required before CWS allows a higher-version update,
  but it changes live tester state and requires explicit approval.
- If CWS rejects an upload with `manifest.json` version not higher than the
  published package, bump the source/package version, regenerate the sanitized
  zip, and push the version commit before uploading again.
- After package upload, re-check Privacy. CWS may add new required permission
  reason fields and keep Submit for Review disabled until they are saved.

Useful commands:

```powershell
agent-browser --cdp 9222 --session <session-name> open <cws-url>
agent-browser --cdp 9222 --session <session-name> snapshot -i
agent-browser --cdp 9222 --session <session-name> find text "文件包" click --exact
agent-browser --cdp 9222 --session <session-name> find role button click --name "提请审核"
```

In PowerShell, prefer semantic `find ...` commands over raw refs when refs are
stale or awkward to quote.

## Fallbacks

- In-app browser is acceptable when it already has the required authenticated
  session and the action does not require reliable native file upload.
- Codex Chrome extension control may not work on Chrome Web Store pages because
  extension script injection can be blocked there.
- A fresh `agent-browser --headed` session is useful for ordinary websites, but
  it will not automatically reuse the Product Owner's CWS login.
- Some CWS upload controls open a native file chooser from a Material button,
  with no stable file input exposed to `agent-browser upload`. In that case,
  connect Playwright to the same CDP browser and handle the file chooser:

```powershell
$env:TEMP = "<workspace>\.tmp"
$env:TMP = "<workspace>\.tmp"
node -e "`
(async()=>{ `
  const { chromium } = require('playwright'); `
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); `
  const page = browser.contexts()[0].pages()[0]; `
  await page.bringToFront(); `
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 }); `
  await page.getByRole('button', { name: /选择文件/ }).click(); `
  const chooser = await chooserPromise; `
  await chooser.setFiles('<absolute-path-to-cws-zip>'); `
  await page.waitForTimeout(15000); `
  await browser.close(); `
})().catch(e=>{ console.error(e); process.exit(1); })"
```

Set `TEMP` / `TMP` to a writable workspace directory when sandboxed Playwright
cannot create artifacts in the OS user temp directory.

## Verification Checklist

Before making CWS changes:

- Confirm the page is the intended dashboard and item.
- Confirm the item state, such as draft, pending review, or published.
- Confirm the next action is within Product Owner approval.
- Confirm any files to upload exist locally and match CWS requirements.

After making CWS changes:

- Confirm the page shows the expected saved/submitted state.
- Record only non-sensitive evidence in release notes.
- If tests are waived by Product Owner, label the evidence as waived rather than
  passed.
