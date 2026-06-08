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
platforms/desktop-electron/dist/TimeWhere-0.3.1-win-portable.exe
```

Mac package output:

```text
platforms/desktop-electron/dist/TimeWhere-0.3.1-mac-universal.zip
```

Note: mac 打包通常需要在 macOS 上执行 `npm run electron:package:mac`。当前 macOS artifact 目标是 Universal zip，覆盖 Intel Mac 和 Apple Silicon。如果在 Windows 上尝试该命令，可能会因平台能力限制而失败。

远程触发打包（推荐在 Windows 上直接执行）：

前提：

- 已安装并登录 `gh` CLI
- 当前分支有 `build` 权限和 workflow 运行权限

执行：

```powershell
npm run electron:package:mac:remote
```

该命令会触发仓库中的 macOS Workflow。Workflow 成功后在 Actions 页面下载：
- `TimeWhere-mac-package`

如果你愿意，我可以下一步再补一条一条命令把 artifact 自动下载并重命名到固定路径。  

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
