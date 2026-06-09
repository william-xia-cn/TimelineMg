#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/release/package-mac-internal-zip.sh /path/to/TimeWhere.app TimeWhere-mac-internal.zip

The target should already be signed and verified. This script creates the final
internal zip and a SHA256 sidecar for that final zip.

Optional:
  TIMEWHERE_OVERWRITE=1  Replace an existing output zip and .sha256 file.
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
  fail "macOS is required because this script uses ditto."
fi

source_path="${1:-}"
output_zip="${2:-}"

[[ -n "$source_path" && -n "$output_zip" ]] || { usage >&2; fail "Missing source path or output zip."; }
[[ -e "$source_path" ]] || fail "Source path does not exist: $source_path"

if [[ -e "$output_zip" || -e "${output_zip}.sha256" ]]; then
  if [[ "${TIMEWHERE_OVERWRITE:-0}" != "1" ]]; then
    fail "Output already exists. Set TIMEWHERE_OVERWRITE=1 to replace: $output_zip"
  fi
  rm -f "$output_zip" "${output_zip}.sha256"
fi

if ! command -v ditto >/dev/null 2>&1; then
  fail "ditto was not found."
fi

if ! command -v shasum >/dev/null 2>&1; then
  fail "shasum was not found."
fi

echo "Packaging final internal macOS zip:"
echo "  source: $source_path"
echo "  output: $output_zip"

ditto -c -k --keepParent "$source_path" "$output_zip"
shasum -a 256 "$output_zip" > "${output_zip}.sha256"

cat "${output_zip}.sha256"
echo "PASS: internal zip and SHA256 generated."
