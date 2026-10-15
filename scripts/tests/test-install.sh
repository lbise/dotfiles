#!/usr/bin/env bash
# Run install.sh against a copy of the repo whose steps are stubs that only log.
# Uses the real all_apps.sh, since sourced steps can clobber install.sh state.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

if ! grep -qi '^ID=arch' /etc/os-release 2>/dev/null; then
    echo "SKIP: install.sh test needs Arch Linux"
    exit 0
fi

REPO="$TMP_DIR/repo"
LOG="$TMP_DIR/steps.log"
mkdir -p "$REPO/install/apps"
cp "$ROOT/install.sh" "$REPO/"
cp "$ROOT/install/helpers.sh" "$ROOT/install/apps/all_apps.sh" "$REPO/install/"
mv "$REPO/install/all_apps.sh" "$REPO/install/apps/"

stub() {
    printf '#!/usr/bin/env bash\necho %s >> "%s"\n' "$2" "$LOG" > "$REPO/$1"
    chmod +x "$REPO/$1"
}
stub install/packages_arch.sh packages
stub install/symlinks.sh symlinks
stub install/apps/stub_app.sh app
stub install/setup_arch.sh setup

USER=leo "$REPO/install.sh" > "$TMP_DIR/out.log" 2>&1 ||
    fail "install.sh exited non-zero: $(cat "$TMP_DIR/out.log")"

expected=$'packages\nsymlinks\napp\nsetup'
[[ "$(cat "$LOG")" == "$expected" ]] ||
    fail "steps ran as: $(tr '\n' ' ' < "$LOG"), expected: packages symlinks app setup"

echo "PASS: install.sh"
