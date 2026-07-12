#!/usr/bin/env bash
set -euo pipefail

CERT_SHA256="9dd8abe0acc893bf30495f494cea8cf7b404b90120d5f986e3551ee47fdf96bf"

usage() {
  cat <<'EOF'
Usage:
  TIMEWHERE_CODESIGN_IDENTITY="TimeWhere Internal Code Signing" \
    scripts/release/build-mac-internal-installer-dmg.sh \
      /path/to/TimeWhere.app \
      /path/to/TimeWhere-Internal-Code-Signing.cer \
      /path/to/TimeWhere-0.3.4-mac-internal-installer.dmg

Builds an internal-only DMG containing a one-click installer. The certificate
must be the approved public certificate; private keys and .p12 files are never
copied into the DMG.
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${mountpoint:-}" && -d "$mountpoint" ]]; then
    hdiutil detach "$mountpoint" -quiet >/dev/null 2>&1 || true
  fi
  if [[ -n "${tmpdir:-}" && -d "$tmpdir" ]]; then
    rm -rf "$tmpdir"
  fi
}
trap cleanup EXIT

[[ "$(uname -s)" == "Darwin" ]] || fail "macOS is required."
[[ "${1:-}" != "-h" && "${1:-}" != "--help" ]] || { usage; exit 0; }

app_path="${1:-}"
cert_path="${2:-}"
output_dmg="${3:-}"
identity="${TIMEWHERE_CODESIGN_IDENTITY:-}"
dmg_format="${TIMEWHERE_DMG_FORMAT:-UDZO}"

[[ -d "$app_path" && -f "$app_path/Contents/Info.plist" ]] || fail "Invalid TimeWhere.app path."
[[ -f "$cert_path" ]] || fail "Public certificate was not found."
[[ -n "$output_dmg" ]] || { usage >&2; fail "Missing output DMG path."; }
[[ -n "$identity" ]] || fail "TIMEWHERE_CODESIGN_IDENTITY is required."
[[ "$identity" != *"Developer ID"* ]] || fail "Developer ID is blocked in this internal lane."
[[ "$dmg_format" == "UDZO" || "$dmg_format" == "UDRO" ]] \
  || fail "TIMEWHERE_DMG_FORMAT must be UDZO or UDRO."

for command_name in codesign ditto hdiutil lipo osacompile openssl shasum; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name was not found."
done

actual_cert_sha="$(shasum -a 256 "$cert_path" | awk '{print $1}')"
[[ "$actual_cert_sha" == "$CERT_SHA256" ]] || fail "Public certificate SHA256 does not match."

codesign --verify --deep --strict --verbose=2 "$app_path"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "$app_path/Contents/Info.plist")"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
  "$app_path/Contents/Info.plist")"
[[ "$bundle_id" == "cn.williamxia.timewhere" ]] || fail "Unexpected bundle identifier: $bundle_id"

archs="$(lipo -archs "$app_path/Contents/MacOS/TimeWhere")"
[[ "$archs" == *"x86_64"* && "$archs" == *"arm64"* ]] || fail "App is not Universal."

if [[ -e "$output_dmg" || -e "${output_dmg}.sha256" ]]; then
  if [[ "${TIMEWHERE_OVERWRITE:-0}" != "1" ]]; then
    fail "Output exists. Set TIMEWHERE_OVERWRITE=1 to replace it."
  fi
  rm -f "$output_dmg" "${output_dmg}.sha256"
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
tmpdir="$(mktemp -d)"
staging="$tmpdir/dmg-root"
installer_app="$staging/安装 TimeWhere.app"
resources="$staging/.TimeWhereInstaller"
mountpoint="$tmpdir/mount"

mkdir -p "$staging" "$mountpoint"
osacompile -l JavaScript -o "$installer_app" "$script_dir/Install TimeWhere.js"
mkdir -p "$resources/Payload"

ditto "$app_path" "$resources/Payload/TimeWhere.app"
cp "$cert_path" "$resources/TimeWhere-Internal-Code-Signing.cer"
cp "$script_dir/install-mac-internal-root.sh" "$resources/install-mac-internal-root.sh"
chmod 755 "$resources/install-mac-internal-root.sh"
printf '%s\n' "$version" > "$resources/version.txt"

cat > "$staging/安装说明.txt" <<EOF
TimeWhere $version 内部安装器

1. 按住 Control 点击“安装 TimeWhere.app”，选择“打开”。
2. 点击“安装”，输入一次管理员密码。
3. 安装器会自动校验证书和应用、安装到 Applications 并启动。

仅供管理员批准的内部 Mac。不是 Developer ID 或 Apple 公证版本。
EOF

codesign --force --sign "$identity" "$installer_app"
codesign --verify --strict --verbose=2 "$installer_app"

mkdir -p "$(dirname "$output_dmg")"
hdiutil create \
  -volname "TimeWhere Internal Installer" \
  -srcfolder "$staging" \
  -format "$dmg_format" \
  -ov \
  "$output_dmg" >/dev/null

shasum -a 256 "$output_dmg" > "${output_dmg}.sha256"

hdiutil attach -readonly -nobrowse -mountpoint "$mountpoint" "$output_dmg" >/dev/null
[[ -d "$mountpoint/安装 TimeWhere.app" ]] || fail "Installer app missing from DMG."
[[ -f "$mountpoint/安装说明.txt" ]] || fail "Quick-start guide missing from DMG."
[[ -d "$mountpoint/.TimeWhereInstaller/Payload/TimeWhere.app" ]] \
  || fail "TimeWhere payload missing from DMG."
[[ ! -e "$mountpoint/.TimeWhereInstaller/TimeWhere-Internal-Code-Signing.p12" ]] \
  || fail "Private certificate bundle must not be present."
codesign --verify --strict --verbose=2 "$mountpoint/安装 TimeWhere.app"
hdiutil detach "$mountpoint" -quiet
mountpoint=""

cat "${output_dmg}.sha256"
echo "PASS: internal installer DMG created and verified."
