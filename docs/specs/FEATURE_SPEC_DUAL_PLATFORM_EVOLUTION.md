# Feature Spec: Dual-Platform Evolution

## Summary

TimeWhere keeps the Chrome Extension shell while adding a standalone Windows Electron app. The Windows app must be complete on its own: it runs from local IndexedDB, can use Google Drive `appDataFolder` sync through the bundled desktop OAuth client, and does not require the Chrome extension to be installed or connected.

Chrome extension connection is an optional enhancement for detection / opening workflows only. It must not transfer TimeWhere task data and must not become a prerequisite for Windows use.

## Goals

- Preserve the current Chrome Extension and Side Panel experience.
- Provide a Windows portable exe that can open Dashboard, Tasks, Calendar, Settings, MatrixView, and ManageBac flows.
- Keep IndexedDB / Dexie v5 as the runtime data store.
- Reuse Google Drive `appDataFolder` sync with a desktop installed-app OAuth path.
- Use Electron desktop notifications for task reminders while the app is running.
- Add a nonce-verified optional Chrome extension bridge.

## Non-Goals

- Desktop installer, signing, notarization, auto-update, or Mac App Store release.
- Public Chrome Web Store expansion or CWS submission of bridge permissions.
- SQLite migration or shared local database between Chrome and Electron.
- Moving shared code out of `extension/` before a staging build exists.
- Silent account binding, silent sync, or silent overwrite after reinstall.
- Treating Chrome extension installation as required for Windows app use.

## Current Facts

- Product version: `0.3.0`.
- DB schema: IndexedDB / Dexie v5.
- Current Chrome shell: Chrome Extension Side Panel.
- Desktop shell: `platforms/desktop-electron/`.
- Google Sync: `extension/shared/js/google-sync.js`, Google Drive `appDataFolder`, optional and local-first.
- Chrome local testing package depends on `manifest.key` and the internal Chrome Extension OAuth client; CWS packages strip `manifest.key` and inject the CWS OAuth client.

## Phases

### Phase 1: Decision And Boundary

- Record the Windows desktop direction in `DECISIONS.md`.
- Record the active implementation stage in `PROJECT_MASTER.md` and `TASK_BOARD.md`.
- Maintain this feature spec and `docs/PLATFORM_BOUNDARY.md` as the durable architecture boundary.

### Phase 2: Reinstall Recovery UX

- Detect a local DB with no meaningful user data while Google Sync is not connected.
- Show a Settings prompt to connect Google and then explicitly confirm restore from cloud.
- Never bind the account silently.
- Never overwrite local IndexedDB without a typed confirmation.

### Phase 3: Lightweight Platform Adapter

- Add `TimeWherePlatform` in the existing `extension/` package.
- Chrome adapter wraps `chrome.*` access for windows, notifications, alarms, badge, and Google token.
- Desktop adapter routes platform calls through Electron preload IPC.
- Business pages may migrate gradually; old direct platform calls can remain temporarily when tests document the remaining surface.

### Phase 4: Windows Desktop Portable

- Use `platforms/desktop-electron/` for the Electron shell.
- Load existing pages from `extension/` in development and from packaged `resources/extension` in portable builds.
- Provide app menu navigation for Dashboard, Tasks, Calendar, Settings, MatrixView import, and ManageBac sync.
- Configure `electron-builder` portable target.
- Package output: `platforms/desktop-electron/dist/TimeWhere-0.3.0-win-portable.exe`.

### Phase 5: Desktop Google Sync

- Use Google installed-app OAuth with Authorization Code + PKCE, system browser, and localhost callback.
- Bundle the configured Google Desktop OAuth client ID; `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID` is an optional override for testing or client rotation.
- Desktop OAuth uses PKCE plus an artifact-bundled Google Desktop client metadata secret for the default Desktop client per D-032. The generated secrets module is an internal packaging input and must remain untracked.
- Store refresh token under Electron `app.getPath('userData')` only through Electron `safeStorage`.
- If encrypted storage is unavailable, refuse to save plaintext refresh token and show failure to the user.

### Phase 6: Desktop Notifications

- Electron main process owns reminder timers while the app is running.
- Renderer computes due reminders with existing `TimeWhereReminders` rules and asks `TimeWherePlatform.reminderRuntime.rescheduleAll()` to schedule notifications.
- Clicking a notification opens Focus with task or Daily Journal context when provided.
- Closing the Windows app stops reminder delivery in this first version.

### Phase 7: Optional Chrome Extension Bridge

- Settings offers fixed development ID `ogdjmelmfkfahppahhkkggdejjainbnd`, CWS ID `bokjekfjghliieopghopibmhjokgkjkb`, or custom ID.
- Electron starts a one-shot `127.0.0.1` WebSocket server and opens `chrome-extension://<id>/pages/desktop-bridge/bridge.html?port=<port>&nonce=<nonce>`.
- The extension sends only extension ID, extension version, bridge version, and nonce.
- Missing extension, old bridge version, nonce mismatch, or timeout are shown as non-blocking connection failures.

### Phase 8: Shared Core Migration Evaluation

- Do not place a top-level `core/` outside the Chrome package and reference it directly from extension pages.
- If shared code moves later, first add a staging build that assembles Chrome package files from shared core plus Chrome shell files.

## Acceptance Criteria

- Windows desktop app opens core pages without Chrome runtime dependency.
- Desktop Google Drive `appDataFolder` sync can authorize through the system browser using the bundled desktop OAuth client ID.
- `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID` can override the bundled ID for development or client rotation. The default Desktop client uses the generated artifact-bundled metadata secret; `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET` and `desktop-oauth.local.json` are packaging inputs only, not ordinary runtime/user configuration.
- Desktop refresh token is encrypted or not saved.
- Desktop notifications fire while the app is running.
- Chrome extension bridge connects only with matching extension ID and nonce.
- CWS package sanitation does not submit bridge localhost host permission unless separately approved.

## Risks

- Desktop OAuth client rotation requires updating the bundled public client ID or setting `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID` for a test build.
- Windows portable package is unsigned and may trigger SmartScreen until signing is approved later.
- Desktop notifications only work while the app is running in the first version.
- Shared-code migration without staging would break Chrome packaging, so it remains deferred.
