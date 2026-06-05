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
platforms/desktop-electron/dist/TimeWhere-0.3.0-win-portable.exe
```

Mac package output:

```text
platforms/desktop-electron/dist/TimeWhere-0.3.0-mac-universal.zip
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

Desktop Google Drive `appDataFolder` sync uses an installed-app OAuth flow with PKCE and a localhost callback. The desktop OAuth client ID is bundled in the app, and `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID` is only an optional override for testing or client rotation.

Some Google Desktop OAuth clients still require the client secret during the token exchange. Do not commit it. Put it in a local ignored file named `desktop-oauth.local.json` next to the portable exe, under Electron `userData`, or in this package directory for development:

```json
{
  "client_id": "541406150907-0koum8v8mms5d4lrnhuavuh5b55hhben.apps.googleusercontent.com",
  "client_secret": "paste-desktop-client-secret-here"
}
```

`TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET` remains available as a temporary override for local smoke testing.

Refresh tokens are stored under Electron `app.getPath('userData')` and encrypted with Electron `safeStorage`. If encrypted storage is unavailable, TimeWhere refuses to save a plaintext refresh token.

## Chrome Extension Bridge

The bridge is optional. Settings can open an installed Chrome extension bridge page and perform a one-time localhost WebSocket nonce handshake. The bridge only exchanges extension ID, extension version, bridge version, and nonce; it does not transfer task data.
