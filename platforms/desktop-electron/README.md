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

The internal GitHub Actions lane additionally produces
`TimeWhere-0.3.4-mac-internal-installer.dmg` and its SHA256 sidecar. This DMG is
the default installation path for administrator-managed internal Macs; the
signed Universal zip remains the manual recovery artifact.

Note: mac 打包通常需要在 macOS 上执行 `npm run electron:package:mac`。当前 macOS artifact 目标是 Universal zip，覆盖 Intel Mac 和 Apple Silicon。如果在 Windows 上尝试该命令，可能会因平台能力限制而失败。

## macOS GitHub Actions Packaging SOP

Use this SOP when producing an internally self-signed macOS Universal zip with
GitHub Actions. The workflow imports a password-protected internal signing
certificate into an ephemeral runner keychain, signs and verifies
`TimeWhere.app`, creates a final zip and SHA256 sidecar, and uploads a private
Actions artifact. It is not Developer ID signing, notarization, a GitHub
Release, auto-update publication, or external distribution approval.

Prerequisites:

- `gh` CLI is installed and logged in.
- Current account has repository `workflow` permission.
- The package candidate commit has been committed and pushed to `MacRelease`.
- Product Owner has explicitly approved triggering the workflow with the
  repository secret `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET`.
- The repository Actions secrets below have been configured:
  - `MACOS_CERTIFICATE_P12_BASE64`: one-line Base64 of the password-protected
    internal code-signing `.p12`.
  - `MACOS_CERTIFICATE_PASSWORD`: password used when exporting that `.p12`.
  - `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET`: existing internal desktop OAuth
    packaging input.

Prepare the signing secrets on the approved administrator Mac:

1. Create the `TimeWhere Internal Code Signing` self-signed Code Signing
   identity in Keychain Access as described in
   `docs/release/MACOS_INTERNAL_SELF_SIGNED_RELEASE.md`.
2. Export the identity and private key as a password-protected `.p12` outside
   the repository.
3. Convert it to a one-line value without printing it to release evidence:

```bash
openssl base64 -A -in /secure/path/TimeWhere-Internal-Code-Signing.p12 \
  | pbcopy
```

Paste the clipboard value into `MACOS_CERTIFICATE_P12_BASE64`, and store the
export password separately in `MACOS_CERTIFICATE_PASSWORD`. Delete unnecessary
export copies after the GitHub secret is confirmed; retain the authoritative
identity in the administrator-controlled Keychain.

1. Verify GitHub CLI login:

```powershell
gh auth status
```

2. Trigger the macOS workflow:

```powershell
gh workflow run timewhere-desktop-mac.yml --ref MacRelease \
  -f signing_mode=internal-self-signed
```

The command returns a run URL. Record the numeric run id from the URL.

3. Wait for completion:

```powershell
gh run watch <run_id> --exit-status
```

4. Download the artifact:

```powershell
New-Item -ItemType Directory -Force -Path artifacts/mac/<run_id> | Out-Null
gh run download <run_id> --name TimeWhere-mac-internal-self-signed --dir artifacts/mac/<run_id>
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
- artifact name: `TimeWhere-mac-internal-self-signed`
- zip file name, local path, byte size, and SHA256
- signature identity and leaf-certificate SHA256 from the workflow log

Secret and sharing boundary:

- The workflow generates `desktop-oauth-secrets.js` from
  `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET` and bundles the generated metadata
  into the desktop artifact.
- Do not write the raw secret value in docs, logs, release reports, commits, or
  user-facing diagnostics.
- The `.p12`, its password, and runner keychain must never be committed or
  uploaded as workflow artifacts. The Actions artifact is retained for 7 days.
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
