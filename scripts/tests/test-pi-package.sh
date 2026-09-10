#!/usr/bin/env bash
# Exercise the real offline Pi bundle path, including configured local extensions.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

package_home="$TMP_DIR/package-home"
extension_dir="$package_home/extensions"
output_dir="$TMP_DIR/output"
settings="$TMP_DIR/settings.json"
target_home="$TMP_DIR/target-home"
cache_home="${XDG_CACHE_HOME:-$HOME/.cache}"
mkdir -p "$extension_dir" "$output_dir" "$target_home"
printf '%s\n' '// bundled extension fixture' > "$extension_dir/herdr-agent-state.ts"
printf '%s\n' '{"packages":[],"extensions":["~/extensions"]}' > "$settings"

if ! HOME="$package_home" XDG_CACHE_HOME="$cache_home" PI_BUNDLE_RTK=false "$ROOT/scripts/pi_package.sh" \
    --no-publish \
    --settings "$settings" \
    "$output_dir" >"$TMP_DIR/package.log" 2>&1; then
    cat "$TMP_DIR/package.log" >&2
    exit 1
fi

archive=$(find "$output_dir" -maxdepth 1 -name 'pi-v*-offline-*.tar.gz' -print -quit)
[[ -n "$archive" ]] || fail "pi package archive was not created"
tar -tzf "$archive" | grep -Fxq 'pi-extensions/herdr-agent-state.ts' \
    || fail "configured local extension is missing from the archive"

HOME="$target_home" "$ROOT/scripts/pi_update.sh" \
    --archive "$archive" \
    --settings "$settings" >"$TMP_DIR/update.log" 2>&1
[[ -f "$target_home/.pi/agent/extensions/herdr-agent-state.ts" ]] \
    || fail "configured local extension was not installed for Pi"

# A same-version update must repair a missing extension instead of taking the
# runtime-only fast path.
rm "$target_home/.pi/agent/extensions/herdr-agent-state.ts"
HOME="$target_home" "$ROOT/scripts/pi_update.sh" \
    --archive "$archive" \
    --settings "$settings" >"$TMP_DIR/update-repair.log" 2>&1
[[ -f "$target_home/.pi/agent/extensions/herdr-agent-state.ts" ]] \
    || fail "pi update did not repair the missing local extension"

printf 'PASS: pi offline package includes and installs local extensions\n'
