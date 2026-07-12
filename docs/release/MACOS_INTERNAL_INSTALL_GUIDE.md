# TimeWhere macOS 内部自签名版安装部署指南

本文档供管理员在其他受控 Mac 上安装 TimeWhere 内部自签名版本。该版本仅供内部使用，不是 Apple Developer ID 签名或公证版本，不适合公开分发。

## 默认方式：一键 DMG 安装器

新部署默认使用：

```text
TimeWhere-0.3.4-mac-internal-installer.dmg
TimeWhere-0.3.4-mac-internal-installer.dmg.sha256
```

当前已验证的一键安装器基线：

- GitHub Actions run：[`29186636314`](https://github.com/william-xia-cn/TimelineMg/actions/runs/29186636314)
- 构建提交：`b6a6699da3381479127e50a00c11f7f6419f8f5d`
- DMG 文件大小：`222684509` bytes
- DMG SHA256：`d85179539501a0eb0cf93fcaf4c8083c36fa0bac52e7f84c1ecc8b25b710b633`
- GitHub artifact SHA256：`a58047d3dfb40275515b31ded13c6e3b138e97cab82b3c0758c93ed2c7005b94`
- 公钥证书 SHA256：`9dd8abe0acc893bf30495f494cea8cf7b404b90120d5f986e3551ee47fdf96bf`
- 安装器与 payload 签名身份：`TimeWhere Internal Code Signing`
- Payload Bundle ID：`cn.williamxia.timewhere`
- Payload 架构：`x86_64 arm64`

下载后校验 DMG：

```bash
shasum -a 256 TimeWhere-0.3.4-mac-internal-installer.dmg
```

结果必须等于：

```text
d85179539501a0eb0cf93fcaf4c8083c36fa0bac52e7f84c1ecc8b25b710b633
```

目标 Mac 只需：

1. 用 sidecar 核对 DMG 的 SHA256。
2. 双击 DMG。
3. 按住 Control 点击 `安装 TimeWhere.app`，选择“打开”。
4. 点击“安装”，输入一次管理员密码。
5. 等待成功提示；安装器会自动启动 TimeWhere。

安装器会自动完成公钥证书指纹校验、System Keychain Code Signing 信任、应用签名/版本/双架构验证、旧版本备份与失败回滚，并仅清除最终 `/Applications/TimeWhere.app` 的 quarantine。它不会删除或迁移用户数据。

如果一键安装器失败，再使用下方手工恢复流程。

## 手工恢复流程

## 1. 部署文件

将以下三个文件通过管理员批准的内部渠道复制到目标 Mac 的同一目录：

1. `TimeWhere-0.3.4-mac-universal-internal-self-signed.zip`
2. `TimeWhere-0.3.4-mac-universal-internal-self-signed.zip.sha256`
3. `TimeWhere-Internal-Code-Signing.cer`

只分发 `.cer` 公钥证书。不得向目标 Mac 分发 `.p12`、私钥、证书导出密码或 GitHub Secrets。

当前部署基线：

- 支持架构：Intel `x86_64` 和 Apple Silicon `arm64`
- 应用包 SHA256：`59de6caa08ff11d64bb857c127bf862398a68b331207c6635427270acdf4e57f`
- 公钥证书 SHA256：`9dd8abe0acc893bf30495f494cea8cf7b404b90120d5f986e3551ee47fdf96bf`
- 证书名称：`TimeWhere Internal Code Signing`
- 证书有效期：2026-07-12 至 2036-07-09

## 2. 安装前检查

目标 Mac 需要：

- macOS 管理员权限；
- 至少约 500 MB 可用空间；
- 管理员明确批准安装内部自签名软件；
- 未关闭 Gatekeeper，也未全局降低 macOS 安全设置。

打开“终端”，进入三个部署文件所在目录。例如文件位于“下载”目录时：

```bash
cd ~/Downloads
```

确认文件存在：

```bash
ls -lh \
  TimeWhere-0.3.4-mac-universal-internal-self-signed.zip \
  TimeWhere-0.3.4-mac-universal-internal-self-signed.zip.sha256 \
  TimeWhere-Internal-Code-Signing.cer
```

## 3. 校验部署文件

### 3.1 校验应用包

```bash
shasum -a 256 TimeWhere-0.3.4-mac-universal-internal-self-signed.zip
```

结果必须等于：

```text
59de6caa08ff11d64bb857c127bf862398a68b331207c6635427270acdf4e57f
```

也可以查看随包提供的 sidecar：

```bash
cat TimeWhere-0.3.4-mac-universal-internal-self-signed.zip.sha256
```

### 3.2 校验证书文件

```bash
shasum -a 256 TimeWhere-Internal-Code-Signing.cer
```

结果必须等于：

```text
9dd8abe0acc893bf30495f494cea8cf7b404b90120d5f986e3551ee47fdf96bf
```

如果任一哈希不一致，立即停止安装并重新获取文件。不要导入证书，也不要打开应用。

## 4. 导入并信任公钥证书

推荐由管理员使用“钥匙串访问”完成，便于看清证书名称和信任范围。

1. 打开“应用程序”→“实用工具”→“钥匙串访问”。
2. 在左侧选择“系统”钥匙串，使这台 Mac 的受控用户均可使用；如果只允许当前用户使用，可选择“登录”钥匙串。
3. 选择菜单“文件”→“导入项目”。
4. 选择 `TimeWhere-Internal-Code-Signing.cer`。
5. 导入后搜索 `TimeWhere Internal Code Signing`。
6. 双击该证书。
7. 展开“信任”。
8. 将“代码签名”设置为“始终信任”。如果界面只显示“使用此证书时”，将其设置为“始终信任”。
9. 关闭证书窗口。
10. 按提示输入目标 Mac 的管理员密码并确认更新设置。

验证证书详情：

```bash
security find-certificate -c "TimeWhere Internal Code Signing" -p \
  | openssl x509 -noout -subject -fingerprint -sha256 -dates
```

显示的 SHA256 指纹必须是：

```text
9D:D8:AB:E0:AC:C8:93:BF:30:49:5F:49:4C:EA:8C:F7:B4:04:B9:01:20:D5:F9:86:E3:55:1E:E4:7F:DF:96:BF
```

目标 Mac 只需要公钥证书，不应出现对应私钥。不要在目标 Mac 导入 `.p12`。

## 5. 正确解压应用

该 zip 使用 macOS `ditto` 创建。为保留 app bundle 的符号链接和签名结构，请使用 `ditto` 解压，不要用第三方解压工具。

```bash
mkdir -p TimeWhere-install
ditto -x -k \
  TimeWhere-0.3.4-mac-universal-internal-self-signed.zip \
  TimeWhere-install
```

确认应用存在：

```bash
ls -ld TimeWhere-install/TimeWhere.app
```

## 6. 安装前验证签名和架构

严格验证 app bundle：

```bash
codesign --verify --deep --strict --verbose=2 \
  TimeWhere-install/TimeWhere.app
```

成功时应显示：

```text
valid on disk
satisfies its Designated Requirement
```

查看签名身份：

```bash
codesign -dv --verbose=4 TimeWhere-install/TimeWhere.app 2>&1 \
  | grep -E 'Identifier=|Format=|Authority=|TeamIdentifier=|Signed Time='
```

必须包含：

```text
Identifier=cn.williamxia.timewhere
Authority=TimeWhere Internal Code Signing
Format=app bundle with Mach-O universal (x86_64 arm64)
```

确认双架构：

```bash
lipo -archs TimeWhere-install/TimeWhere.app/Contents/MacOS/TimeWhere
```

结果必须同时包含：

```text
x86_64 arm64
```

如果签名或架构验证失败，停止安装。不要通过删除签名、重新签名、关闭 Gatekeeper 或清除全部隔离属性来绕过检查。

## 7. 安装到 Applications

如果 `/Applications/TimeWhere.app` 已存在，先退出 TimeWhere，再由管理员备份或移除旧版本。不要覆盖正在运行的应用。

安装新版本：

```bash
sudo ditto TimeWhere-install/TimeWhere.app /Applications/TimeWhere.app
```

再次验证最终安装位置：

```bash
codesign --verify --deep --strict --verbose=2 /Applications/TimeWhere.app
codesign -dv --verbose=4 /Applications/TimeWhere.app 2>&1 \
  | grep -E 'Identifier=|Authority=|Signed Time='
```

## 8. 首次启动

1. 打开 Finder →“应用程序”。
2. 按住 Control 点击 `TimeWhere.app`，选择“打开”。
3. 检查系统提示中的应用名称，确认是 TimeWhere，再点击“打开”。
4. 如果 macOS 仍阻止启动，打开“系统设置”→“隐私与安全性”，确认被阻止的应用确实是 TimeWhere，然后使用“仍要打开”。
5. 按提示输入管理员密码。

不要执行以下操作：

- 不要运行 `spctl --master-disable`；
- 不要全局关闭 Gatekeeper；
- 不要为了启动而删除应用签名；
- 不要导入 `.p12` 或私钥；
- 不要把此内部包描述为 Apple 公证版本。

## 9. 安装后检查

启动后至少完成以下检查：

1. TimeWhere 主窗口正常打开。
2. 应用版本显示为 `0.3.4`。
3. 关闭并重新打开应用，确认可以再次启动。
4. 本地数据页面可以正常打开。
5. 如需 Google 同步，由实际使用者自行授权；管理员不得记录用户账号、Token 或私人数据。

可选诊断：

```bash
spctl --assess --type execute --verbose /Applications/TimeWhere.app
```

自签名内部版本的 `spctl` 结果只用于诊断，不等同于 Developer ID 公证验收。以证书信任、`codesign --verify` 和管理员批准为本内部通道的安装依据。

## 10. 常见问题

### `CSSMERR_TP_NOT_TRUSTED`

说明目标 Mac 尚未正确建立证书信任。返回钥匙串访问，确认导入的是指纹匹配的公钥证书，并把“代码签名”设置为“始终信任”。

### `a sealed resource is missing or invalid`

通常说明 app bundle 被错误解压或签名后内容被修改。删除本次解压目录，从哈希正确的原始 zip 使用 `ditto -x -k` 重新解压。

### `code object is not signed at all`

说明文件不是批准的自签名包，或 app 内容已损坏。停止安装并重新获取部署文件。

### 显示架构不完整

如果 `lipo -archs` 没有同时显示 `x86_64 arm64`，停止安装；该文件不是本指南对应的 Universal 发布包。

## 11. 卸载与撤销信任

退出应用后卸载：

```bash
sudo rm -rf /Applications/TimeWhere.app
```

删除证书前，确认该证书没有被其他批准的内部应用使用。然后在“钥匙串访问”中搜索 `TimeWhere Internal Code Signing`，核对指纹后删除。

删除证书会使所有由该内部证书签名的软件失去目标 Mac 的信任。不要在仍需运行 TimeWhere 时删除证书。

## 12. 安全边界

- 本流程仅适用于管理员管理的少量内部 Mac。
- 公钥 `.cer` 可以分发给目标 Mac；私钥和 `.p12` 只能保留在批准的签名环境。
- GitHub Actions artifact 不是 GitHub Release，也不是公开发布。
- 自签名版本不能 Apple notarize，不具备 Developer ID 公共分发属性。
- 证书轮换后必须重新分发并信任新证书，旧版本与新版本的信任关系需要分别核验。
