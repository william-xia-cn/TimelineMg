#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/release/verify-mac-self-signed.sh /path/to/TimeWhere.app

Optional:
  TIMEWHERE_RUN_SPCTL=1  Also run spctl --assess as informational output.

Note:
  Self-signed verification is not Developer ID notarization and does not prove
  public Gatekeeper readiness.
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${tmpdir:-}" && -d "$tmpdir" ]]; then
    rm -rf "$tmpdir"
  fi
}
trap cleanup EXIT

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "macOS is required for codesign verification."
fi

target="${1:-}"
[[ -n "$target" ]] || { usage >&2; fail "Missing target app or binary path."; }
[[ -e "$target" ]] || fail "Target does not exist: $target"

if ! command -v codesign >/dev/null 2>&1; then
  fail "codesign was not found."
fi

echo "Verifying internal macOS signature:"
echo "  target: $target"

codesign --verify --deep --strict --verbose=2 "$target"
codesign -dv --verbose=4 "$target" 2>&1

tmpdir="$(mktemp -d)"
(
  cd "$tmpdir"
  if codesign -d --extract-certificates "$target" >/dev/null 2>&1 && [[ -f codesign0 ]]; then
    echo "Leaf certificate SHA256:"
    shasum -a 256 codesign0
  else
    echo "Leaf certificate SHA256: unavailable"
  fi
)

if [[ "${TIMEWHERE_RUN_SPCTL:-0}" == "1" ]]; then
  echo "Running spctl assessment for operator information only."
  echo "Self-signed internal builds are not equivalent to Developer ID notarized Gatekeeper-ready builds."
  spctl --assess --type execute --verbose "$target" || true
fi

echo "PASS: codesign verification completed."
