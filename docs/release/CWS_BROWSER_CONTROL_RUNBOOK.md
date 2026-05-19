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

## Fallbacks

- In-app browser is acceptable when it already has the required authenticated
  session and the action does not require reliable native file upload.
- Codex Chrome extension control may not work on Chrome Web Store pages because
  extension script injection can be blocked there.
- A fresh `agent-browser --headed` session is useful for ordinary websites, but
  it will not automatically reuse the Product Owner's CWS login.

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
