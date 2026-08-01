#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "macOS is required."

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cd "$script_dir/../.." && pwd)"
cd "$project_root"

identity="${TIMEWHERE_CODESIGN_IDENTITY:-TimeWhere Internal Code Signing}"
keychain="${TIMEWHERE_SIGNING_KEYCHAIN:-$HOME/Library/Keychains/TimeWhere-Internal-Signing.keychain-db}"

[[ -f "$keychain" ]] || fail "Signing keychain was not found: $keychain"
command -v node >/dev/null 2>&1 || fail "Node.js is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."

if ! security find-identity -p codesigning "$keychain" | grep -F "$identity" >/dev/null 2>&1; then
  keychain_password="$(security find-generic-password \
    -a "$USER" \
    -s "TimeWhere Internal Signing Keychain Password" \
    -w 2>/dev/null || true)"
  if [[ -z "$keychain_password" ]]; then
    [[ -t 0 ]] || fail "Signing keychain is locked or the identity is unavailable. Run from an interactive Terminal."
    read -r -s -p "Signing keychain password: " keychain_password
    echo
  fi
  security unlock-keychain -p "$keychain_password" "$keychain"
  unset keychain_password
fi

security find-identity -p codesigning "$keychain" | grep -F "$identity" >/dev/null 2>&1 \
  || fail "Signing identity was not found in the approved keychain: $identity"

# Prepare the ignored OAuth metadata module before dependency installation/build.
if [[ -z "${TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET:-}" \
  && ! -f "platforms/desktop-electron/desktop-oauth.local.json" \
  && ! -f "platforms/desktop-electron/desktop-oauth-secrets.js" ]]; then
  [[ -t 0 ]] || fail "Desktop OAuth packaging input is missing. Run from an interactive Terminal."
  read -r -s -p "Desktop OAuth client metadata secret: " TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET
  echo
  export TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET
fi
node tools/prepare-desktop-oauth-secret.js
unset TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET

if [[ "${TIMEWHERE_SKIP_NPM_CI:-0}" != "1" ]]; then
  npm --prefix platforms/desktop-electron ci
fi

CSC_IDENTITY_AUTO_DISCOVERY=false npm run electron:package:mac

app_path="platforms/desktop-electron/dist/mac-universal/TimeWhere.app"
[[ -d "$app_path" ]] || fail "Universal TimeWhere.app was not produced: $app_path"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
cert_path="$tmpdir/TimeWhere-Internal-Code-Signing.cer"
security find-certificate -c "$identity" -p "$keychain" \
  | openssl x509 -outform DER -out "$cert_path"

TIMEWHERE_CODESIGN_IDENTITY="$identity" \
TIMEWHERE_CODESIGN_KEYCHAIN="$keychain" \
TIMEWHERE_ALLOW_UNTRUSTED_SIGNING_IDENTITY=1 \
  scripts/release/sign-mac-self-signed.sh "$app_path"
scripts/release/verify-mac-self-signed.sh "$app_path"

version="$(node -p "require('./platforms/desktop-electron/package.json').version")"
output_dir="artifacts/mac/local/$version"
output_zip="$output_dir/TimeWhere-${version}-mac-universal-internal-self-signed.zip"
output_dmg="$output_dir/TimeWhere-${version}-mac-internal-installer.dmg"
mkdir -p "$output_dir"

TIMEWHERE_OVERWRITE="${TIMEWHERE_OVERWRITE:-0}" \
  scripts/release/package-mac-internal-zip.sh "$app_path" "$output_zip"
TIMEWHERE_CODESIGN_IDENTITY="$identity" \
TIMEWHERE_CODESIGN_KEYCHAIN="$keychain" \
TIMEWHERE_OVERWRITE="${TIMEWHERE_OVERWRITE:-0}" \
  bash scripts/release/build-mac-internal-installer-dmg.sh "$app_path" "$cert_path" "$output_dmg"

echo "PASS: local internal macOS build completed."
echo "Artifacts: $output_dir"
