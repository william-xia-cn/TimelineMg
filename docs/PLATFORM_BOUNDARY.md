# Platform Boundary

## Purpose

This document defines the boundary between TimeWhere business code and platform-specific shells. The Chrome Extension remains a supported shell. The desktop Electron shell targets a standalone Windows portable app first; Chrome extension connection is optional and must not be required for Windows use.

## Source Layout

| Area | Current role |
|---|---|
| `extension/` | Chrome Extension package root and current shared runtime source. |
| `extension/shared/js/platform.js` | Lightweight `TimeWherePlatform` adapter loaded by browser pages. |
| `extension/pages/desktop-bridge/` | Optional Chrome extension bridge page; sends only extension ID/version/nonce. |
| `platforms/desktop-electron/` | Standalone desktop Electron shell and Windows portable package target. |
| `platforms/macos-widget/` | Display-only WidgetKit source preparation for macOS current-task/count widgets. |
| `docs/specs/FEATURE_SPEC_DUAL_PLATFORM_EVOLUTION.md` | Product and rollout spec for this evolution. |

Do not move shared code out of `extension/` until a staging build is approved. Chrome packages cannot reference files outside their package root directly.

## TimeWherePlatform Contract

```js
TimeWherePlatform = {
  name,
  window: {
    openMain(route),
    openQuickPanel(),
    focus(route)
  },
  notification: {
    notify(payload),
    onClick(callback)
  },
  reminderRuntime: {
    schedule(reminder),
    cancel(id),
    rescheduleAll(reminders)
  },
  badge: {
    set(state),
    clear()
  },
  auth: {
    getStatus(),
    getGoogleToken({ interactive, scopes }),
    getAccountInfo(),
    revokeGoogleToken()
  },
  chromeBridge: {
    connectExtension({ extensionId }),
    getStatus()
  },
  system: {
    getDesktopSettings(),
    setDesktopSettings(settings),
    writeWidgetSnapshot(snapshot),
    getDesktopProfile(),
    confirmGoogleAccountSwitch({ pending_auth_id })
  }
}
```

Methods should return objects with a `status` field when a capability is unavailable, for example `{ status: 'not_configured' }` or `{ status: 'not_supported' }`.

## Chrome Adapter

The Chrome adapter may use:

- `chrome.runtime` for package URLs and message context.
- `chrome.tabs` for opening extension pages.
- `chrome.sidePanel` for quick panel behavior where available.
- `chrome.notifications` for local reminders and notification click handling.
- `chrome.alarms` for reminder scheduling.
- `chrome.action` for badge state.
- `chrome.identity` for optional Google Drive `appDataFolder` sync.

Chrome permissions must stay minimal and match actual source usage. The local desktop bridge host permission is for local development / unpacked extension testing; CWS bridge submission requires a separate Product Owner approval.

## Desktop Electron Adapter

The desktop Electron adapter uses the preload bridge for:

- opening and focusing local TimeWhere pages;
- native desktop notifications while the app is running;
- reminder scheduling / cancellation in the Electron main process;
- installed-app Google OAuth with PKCE using the bundled desktop OAuth client ID and artifact-bundled Desktop client metadata secret, with `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID` available only as an override;
- optional Chrome extension nonce bridge.
- writing a sanitized `timewhere-widget-v1.json` snapshot for display-only macOS WidgetKit source preparation;
- Google-account-bound local profile selection for the desktop shell; different
  Google accounts must use different Electron persistent partitions after the
  first unowned local profile is bound;
- tray/menu-bar behavior and startup settings are persisted to
  `platforms/desktop-electron/` user data as `timewhere-desktop-settings.json`
  with `closeToTray` and `startAtLogin`; legacy `minimizeToTray` may be read or
  returned only for old-setting compatibility and must not drive UI behavior.

Desktop window controls use native OS behavior for minimize. Closing the main
window hides TimeWhere to the tray/menu-bar when `closeToTray` is enabled; the
tray/menu-bar or app menu `退出` command is the explicit full-quit path.

Electron does not silently reuse Chrome Extension data. It uses its own Chromium IndexedDB runtime unless a future migration plan is approved.

Desktop OAuth uses PKCE plus an artifact-bundled Google Desktop client metadata secret for the default Desktop client. Internal packaging generates `platforms/desktop-electron/desktop-oauth-secrets.js` from ignored local/CI input and includes it in the desktop artifact; the generated file and raw secret must not be committed or recorded in repository evidence. Ordinary users must not provide a local secret file or secret environment variable.

Desktop Google Sync also requests `openid profile email` so the desktop shell can
derive a local-only `account_key` from the Google subject and display the
currently connected account in Settings. The key/name/email are local identity
metadata only and must not be included in Drive sync snapshots. If the active
desktop profile is owned by account A and OAuth authorizes account B, the shell
must block sync with `account_mismatch` until the user confirms switching to B's
separate local profile.

Desktop refresh tokens must be encrypted with Electron `safeStorage`. If encrypted storage is unavailable, do not save a plaintext refresh token.

The Chrome extension bridge may exchange only extension ID, extension version, bridge version, and nonce. It must not transfer tasks, calendars, journals, tokens, or other user data.

The macOS WidgetKit preparation reads only the sanitized widget snapshot. It must
not read IndexedDB, Google sync state, OAuth tokens, client secrets, account
identifiers, cookies, or raw local data. The widget is not embedded into the
macOS artifact until a separate signing/App Group/package decision is approved.

## Current Direct Chrome API Exceptions

`extension/shared/js/platform.js` is the preferred place for new platform calls. Existing direct calls may remain temporarily only in these areas:

| File | Reason |
|---|---|
| `extension/background.js` | Chrome Extension service-worker shell for Side Panel setup, alarms, notification delivery, and notification-click routing. |
| `extension/shared/js/managebac.js` | Background relay request for ManageBac ICS fetch, because content/page code cannot fetch every configured URL directly. |
| `extension/pages/settings/script.js` | Chrome-only reminder diagnostic relay messages guarded behind runtime checks. |
| `extension/popup/popup.js` | Fallback navigation/window opening when `TimeWherePlatform` is unavailable or fails. |
| `extension/pages/desktop-bridge/bridge.js` | Optional Chrome extension bridge page for desktop handshake only. |

Tests in `tests/platform-boundary.test.js` print and constrain this list so accidental new direct calls are visible.

## Data And Restore Boundary

- IndexedDB / Dexie v5 remains the MVP runtime store.
- Google Drive `appDataFolder` remains the cloud sync mechanism.
- JSON export/import remains a fallback migration path.
- Reinstall or MDM recovery must be explicit:
  1. detect local empty state;
  2. ask the user to connect Google;
  3. show cloud restore risk copy;
  4. require confirmation before local overwrite.

No shell may silently bind a Google account, silently sync, or silently overwrite local data after reinstall.

## Release Matrix

| Target | State | Notes |
|---|---|---|
| Chrome Extension Side Panel | Supported shell | CWS/private release actions require Product Owner approval. |
| Chrome local unpacked package | Internal testing only | Uses development extension ID and local package key handling. |
| Windows desktop portable | Active implementation target | `platforms/desktop-electron/`; package target `TimeWhere-0.3.0-win-portable.exe`; complete local app without Chrome extension dependency. |
| Shared Core staging package | Future evaluation | Required before moving shared code outside `extension/`. |
