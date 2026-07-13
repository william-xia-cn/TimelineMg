# TimeWhere Desktop Electron

This package builds the standalone TimeWhere desktop shell. The first desktop target is Windows portable exe.

The desktop app loads the existing TimeWhere pages from `extension/`, stores runtime data in Chromium IndexedDB, and does not require the Chrome extension to be installed. Chrome extension connection is an optional Settings integration only.

## WebDev Runtime Mode

WebDev v1 repositions Desktop as a runtime around the Web App. The current Electron shell keeps the legacy extension-backed mode as default, and exposes an opt-in WebDev runtime mode for local development:

```powershell
$env:TIMEWHERE_DESKTOP_RUNTIME_MODE = 'webdev'
$env:TIMEWHERE_WEB_APP_URL = 'http://127.0.0.1:4173/'
npm run electron:dev
```

In this mode Electron loads the configured Web App URL and maps native desktop routes to Web App hash views such as `#dashboard`, `#tasks`, `#calendar`, and `#settings`. The desktop shell remains responsible only for native runtime capabilities: window, tray, notification, autostart, secure storage, external link handling, and preload IPC bridge. Business logic remains owned by the Web App.

This is not a packaging or release approval. Internal package generation, signing, notarization, auto-update, and distribution remain separate Gate E decisions.

## Commands

```powershell
npm --prefix platforms/desktop-electron install
npm run electron:dev
npm run electron:smoke
npm run webdev:desktop:readiness
npm run webdev:desktop:smoke
npm run electron:package:win
npm run electron:package:mac
```

`npm run webdev:desktop:readiness` is a static WebDev Runtime boundary check: it verifies the opt-in runtime mode, route guards, native preload bridge, and Gate E packaging boundary without launching Electron.

`npm run webdev:desktop:smoke` starts local WebDev Worker / Pages services and launches Electron in `TIMEWHERE_DESKTOP_RUNTIME_MODE=webdev` smoke mode. It is a local runtime check only; it does not create a desktop package, sign, notarize, or distribute anything.

Windows package output:

```text
platforms/desktop-electron/dist/TimeWhere-0.3.2-win-portable.exe
```

Mac package output:

```text
platforms/desktop-electron/dist/TimeWhere-0.3.4-mac-universal.zip
```

Note: mac 打包通常需要在 macOS 上执行 `npm run electron:package:mac`。当前 macOS artifact 目标是 Universal zip，覆盖 Intel Mac 和 Apple Silicon。如果在 Windows 上尝试该命令，可能会因平台能力限制而失败。

## macOS GitHub Actions Packaging SOP

Use this SOP when producing an internal macOS Universal zip from Windows. This
creates a GitHub Actions artifact only; it is not a public release, signing,
notarization, GitHub Release, auto-update publication, or external distribution
approval.

Prerequisites:

- `gh` CLI is installed and logged in.
- Current account has repository `workflow` permission.
- The package candidate commit has been committed and pushed to `master`.
- Product Owner has explicitly approved triggering the workflow with the
  repository secret `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET`.

1. Verify GitHub CLI login:

```powershell
gh auth status
```

2. Trigger the macOS workflow:

```powershell
gh workflow run timewhere-desktop-mac.yml --ref master
```

The command returns a run URL. Record the numeric run id from the URL.

3. Wait for completion:

```powershell
gh run watch <run_id> --exit-status
```

4. Download the artifact:

```powershell
New-Item -ItemType Directory -Force -Path artifacts/mac/<run_id> | Out-Null
gh run download <run_id> --name TimeWhere-mac-package --dir artifacts/mac/<run_id>
```

5. Record package evidence:

```powershell
Get-ChildItem -LiteralPath artifacts/mac/<run_id> -Filter *.zip | Select-Object Name,Length,LastWriteTime
Get-ChildItem -LiteralPath artifacts/mac/<run_id> -Filter *.zip | Get-FileHash -Algorithm SHA256
git rev-parse HEAD
git status --branch --short
```

Evidence to report:

- commit SHA and branch
- workflow run id
- artifact name: `TimeWhere-mac-package`
- zip file name, local path, byte size, and SHA256

Secret and sharing boundary:

- The workflow generates `desktop-oauth-secrets.js` from
  `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET` and bundles the generated metadata
  into the desktop artifact.
- Do not write the raw secret value in docs, logs, release reports, commits, or
  user-facing diagnostics.
- Uploading the macOS zip to a shared Google Drive folder or any external
  destination requires separate explicit Product Owner approval acknowledging
  that the artifact contains the internal Desktop OAuth client metadata secret.
## Google Sync

Desktop Google Drive `appDataFolder` sync uses an installed-app OAuth flow with PKCE and a localhost callback. The desktop OAuth client ID is tracked in source, and the Desktop client metadata secret is generated into `desktop-oauth-secrets.js` from ignored local/CI packaging input before building internal desktop artifacts. `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID` is only an optional override for testing or client rotation.

The artifact-bundled Desktop client metadata secret is not a user token or password. It exists only because Google's Desktop token endpoint may require `client_secret` even when PKCE is used. Ordinary users should not create `desktop-oauth.local.json` or set a Desktop client secret environment variable; those are internal packaging inputs only.

Refresh tokens are stored under Electron `app.getPath('userData')` and encrypted with Electron `safeStorage`. If encrypted storage is unavailable, TimeWhere refuses to save a plaintext refresh token.

Desktop sync is account-bound. The OAuth flow also requests `openid profile email`
so TimeWhere can derive a local-only account key from Google's subject and show
the connected account in Settings. The first unowned local profile may be bound
to the first connected Google account; later accounts use separate Electron
persistent partitions so their IndexedDB data does not mix.

## Chrome Extension Bridge

The bridge is optional. Settings can open an installed Chrome extension bridge page and perform a one-time localhost WebSocket nonce handshake. The bridge only exchanges extension ID, extension version, bridge version, and nonce; it does not transfer task data.
