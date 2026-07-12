#!/usr/bin/env bash
set -euo pipefail

CERT_NAME="TimeWhere Internal Code Signing"
CERT_SHA256="9dd8abe0acc893bf30495f494cea8cf7b404b90120d5f986e3551ee47fdf96bf"
EXPECTED_BUNDLE_ID="cn.williamxia.timewhere"
SYSTEM_KEYCHAIN="/Library/Keychains/System.keychain"
TARGET_APP="/Applications/TimeWhere.app"

fail() {
  echo "安装失败：$*" >&2
  exit 1
}

[[ "$(id -u)" == "0" ]] || fail "需要管理员权限。"
[[ "$(uname -s)" == "Darwin" ]] || fail "仅支持 macOS。"

resources_dir="${1:-}"
[[ -n "$resources_dir" && -d "$resources_dir" ]] || fail "安装资源目录不存在。"

cert_path="$resources_dir/TimeWhere-Internal-Code-Signing.cer"
payload_app="$resources_dir/Payload/TimeWhere.app"
version_file="$resources_dir/version.txt"

[[ -f "$cert_path" ]] || fail "缺少公钥证书。"
[[ -d "$payload_app" ]] || fail "缺少 TimeWhere.app。"
[[ -f "$version_file" ]] || fail "缺少版本信息。"

expected_version="$(tr -d '\r\n' < "$version_file")"
[[ -n "$expected_version" ]] || fail "版本信息为空。"

actual_cert_sha="$(shasum -a 256 "$cert_path" | awk '{print $1}')"
[[ "$actual_cert_sha" == "$CERT_SHA256" ]] || fail "证书 SHA256 不匹配。"

cert_subject="$(openssl x509 -inform DER -in "$cert_path" -noout -subject 2>/dev/null)"
[[ "$cert_subject" == *"CN=$CERT_NAME"* || "$cert_subject" == *"CN = $CERT_NAME"* ]] \
  || fail "证书名称不匹配。"

cert_sha1="$(openssl x509 -inform DER -in "$cert_path" -noout -fingerprint -sha1 \
  | sed 's/^.*=//;s/://g' | tr '[:lower:]' '[:upper:]')"
[[ -n "$cert_sha1" ]] || fail "无法读取证书指纹。"

certificate_was_present=0
certificate_added=0
stage_root=""
backup_app=""
target_replaced=0
install_succeeded=0

if security find-certificate -a -Z "$SYSTEM_KEYCHAIN" 2>/dev/null \
  | tr -d ':' | grep -Fqi "$cert_sha1"; then
  certificate_was_present=1
fi

cleanup() {
  status=$?

  if [[ "$status" -ne 0 || "$install_succeeded" != "1" ]]; then
    if [[ "$target_replaced" == "1" ]]; then
      rm -rf "$TARGET_APP"
      if [[ -n "$backup_app" && -d "$backup_app" ]]; then
        mv "$backup_app" "$TARGET_APP"
      fi
    fi

    if [[ "$certificate_added" == "1" && "$certificate_was_present" == "0" ]]; then
      security delete-certificate -Z "$cert_sha1" "$SYSTEM_KEYCHAIN" >/dev/null 2>&1 || true
    fi
  fi

  [[ -z "$stage_root" ]] || rm -rf "$stage_root"
  if [[ "$install_succeeded" == "1" && -n "$backup_app" ]]; then
    rm -rf "$backup_app"
  fi

  exit "$status"
}
trap cleanup EXIT

security add-trusted-cert \
  -d \
  -r trustRoot \
  -p codeSign \
  -k "$SYSTEM_KEYCHAIN" \
  "$cert_path"
certificate_added=1

security verify-cert -c "$cert_path" -p codeSign >/dev/null \
  || fail "证书代码签名信任验证失败。"

verify_app() {
  app_path="$1"

  codesign --verify --deep --strict --verbose=2 "$app_path" \
    || fail "应用签名验证失败。"

  signature_details="$(codesign -dv --verbose=4 "$app_path" 2>&1)"
  authority="$(printf '%s\n' "$signature_details" | sed -n 's/^Authority=//p' | head -1)"
  identifier="$(printf '%s\n' "$signature_details" | sed -n 's/^Identifier=//p' | head -1)"
  [[ "$authority" == "$CERT_NAME" ]] || fail "应用签名身份不匹配。"
  [[ "$identifier" == "$EXPECTED_BUNDLE_ID" ]] || fail "应用 Bundle ID 不匹配。"

  actual_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
    "$app_path/Contents/Info.plist" 2>/dev/null)"
  [[ "$actual_version" == "$expected_version" ]] || fail "应用版本不匹配。"

  archs="$(lipo -archs "$app_path/Contents/MacOS/TimeWhere" 2>/dev/null)"
  [[ "$archs" == *"x86_64"* && "$archs" == *"arm64"* ]] \
    || fail "应用不是 x86_64 + arm64 Universal 构建。"
}

verify_app "$payload_app"

if pgrep -x TimeWhere >/dev/null 2>&1; then
  fail "TimeWhere 仍在运行，请退出后重试。"
fi

stage_root="$(mktemp -d "/Applications/.TimeWhere-install.XXXXXX")"
staged_app="$stage_root/TimeWhere.app"
ditto "$payload_app" "$staged_app"
verify_app "$staged_app"

if [[ -d "$TARGET_APP" ]]; then
  backup_app="/Applications/.TimeWhere.backup.$$.app"
  rm -rf "$backup_app"
  mv "$TARGET_APP" "$backup_app"
fi

mv "$staged_app" "$TARGET_APP"
target_replaced=1
chown -R root:wheel "$TARGET_APP"

# This is intentionally limited to the verified TimeWhere.app target.
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

verify_app "$TARGET_APP"

install_succeeded=1
echo "TimeWhere $expected_version 已成功安装到 /Applications。"

