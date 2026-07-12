#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  TIMEWHERE_CODESIGN_IDENTITY="TimeWhere Internal Code Signing" \
    scripts/release/sign-mac-self-signed.sh /path/to/TimeWhere.app

This script is for limited internal self-signed macOS builds only.
This repository uses it for TimeWhere.app, not for external helper installation.
It does not use Developer ID, does not notarize, and does not staple.

Optional:
  TIMEWHERE_CODESIGN_EXTRA_ARGS="--options runtime"   Extra codesign args.
  TIMEWHERE_ALLOW_UNTRUSTED_SIGNING_IDENTITY=1         Allow an imported
                                                       self-signed identity on
                                                       an ephemeral CI runner.
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "macOS is required for codesign."
fi

target="${1:-}"
identity="${TIMEWHERE_CODESIGN_IDENTITY:-}"

[[ -n "$target" ]] || { usage >&2; fail "Missing target app or binary path."; }
[[ -e "$target" ]] || fail "Target does not exist: $target"
[[ -n "$identity" ]] || fail "TIMEWHERE_CODESIGN_IDENTITY is required."

case "$identity" in
  *"Developer ID"*)
    fail "Developer ID identities are intentionally blocked in this internal self-signed lane."
    ;;
esac

if ! command -v codesign >/dev/null 2>&1; then
  fail "codesign was not found."
fi

identity_args=(-v)
if [[ "${TIMEWHERE_ALLOW_UNTRUSTED_SIGNING_IDENTITY:-0}" == "1" ]]; then
  identity_args=()
fi

if ! security find-identity "${identity_args[@]}" -p codesigning | grep -F "$identity" >/dev/null 2>&1; then
  fail "Signing identity was not found in the current keychains: $identity"
fi

extra_args=()
if [[ -n "${TIMEWHERE_CODESIGN_EXTRA_ARGS:-}" ]]; then
  # shellcheck disable=SC2206
  extra_args=(${TIMEWHERE_CODESIGN_EXTRA_ARGS})
fi

echo "Signing internal target:"
echo "  target: $target"
echo "  identity: $identity"

codesign --force --deep --sign "$identity" "${extra_args[@]}" "$target"
codesign --verify --deep --strict --verbose=2 "$target"
codesign -dv --verbose=4 "$target" 2>&1 | sed -n '/Authority=/p;/Identifier=/p;/TeamIdentifier=/p'

echo "PASS: internal self-signed codesign verification completed."
