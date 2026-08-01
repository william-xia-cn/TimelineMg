# TimeWhere Desktop Electron

This package builds the standalone TimeWhere desktop shell. The first desktop target is Windows portable exe.

The desktop app loads the existing TimeWhere pages from `extension/`, stores runtime data in Chromium IndexedDB, and does not require the Chrome extension to be installed. Chrome extension connection is an optional Settings integration only.

## Commands

```powershell
npm --prefix platforms/desktop-electron install
npm run electron:dev
npm run electron:smoke
npm run electron:package:win
npm run electron:package:mac
```

Windows package output:

```text
platforms/desktop-electron/dist/TimeWhere-0.3.2-win-portable.exe
```

Mac package output:

```text
platforms/desktop-electron/dist/TimeWhere-0.3.4-mac-universal.zip
```

The local internal build lane additionally produces
`TimeWhere-0.3.4-mac-internal-installer.dmg` and its SHA256 sidecar. This DMG is
the default installation path for administrator-managed internal Macs; the
signed Universal zip remains the manual recovery artifact.

Note: mac 打包通常需要在 macOS 上执行 `npm run electron:package:mac`。当前 macOS artifact 目标是 Universal zip，覆盖 Intel Mac 和 Apple Silicon。如果在 Windows 上尝试该命令，可能会因平台能力限制而失败。

## macOS Local Internal Packaging SOP

The approved administrator Mac is the default compiler and signing machine.
The existing GitHub Actions workflow is retained only as an inactive fallback;
do not trigger it for normal internal macOS builds.

Prerequisites:

- Node.js 22 and npm are installed.
- `TimeWhere Internal Code Signing` and its private key exist in
  `~/Library/Keychains/TimeWhere-Internal-Signing.keychain-db`.
- The Desktop OAuth packaging input is available. It may be supplied at the
  command's secure Terminal prompt, through `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET`,
  or through ignored `platforms/desktop-electron/desktop-oauth.local.json` as
  `{"client_secret":"..."}`. Never commit or print this value.

From a clean, current `MacRelease` checkout, run:

```bash
npm run electron:package:mac:internal
```

If the dedicated signing keychain is locked, enter its password at the secure
Terminal prompt. On this approved Mac, the command may reuse the existing
`TimeWhere Internal Signing Keychain Password` login-keychain item without
printing its value. The command installs the Electron package's locked dependencies with `npm ci`, builds
the Universal app, exports only the public `.cer` to a temporary directory,
signs and verifies the app, then creates the signed recovery zip, installer DMG,
and both SHA256 sidecars under `artifacts/mac/local/<version>/`.

Existing same-version outputs are not overwritten by default. For an intentional
rebuild, use `TIMEWHERE_OVERWRITE=1 npm run electron:package:mac:internal`.
The private key, keychain, OAuth metadata input, and passwords are never copied
into the output directory.
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
