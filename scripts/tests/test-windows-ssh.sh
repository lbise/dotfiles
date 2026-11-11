#!/usr/bin/env bash
# Tests for the hook that copies the SSH config to Windows.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
HOOK="$ROOT/install/apply.d/20-windows-ssh.sh"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
export WIN_SSH_DIR="$TMP_DIR/.ssh"

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

mkdir -p "$WIN_SSH_DIR"
echo "Host hand-written" > "$WIN_SSH_DIR/config"

"$HOOK" >/dev/null
backups=("$WIN_SSH_DIR"/config.bak.*)
[[ ${#backups[@]} -eq 1 ]] || fail "expected one backup, got ${#backups[@]}"
grep -qx 'Host hand-written' "${backups[0]}" || fail "backup lost the original config"
grep -qx 'Include ~/.ssh/ssh_phc_hosts.conf' "$WIN_SSH_DIR/config" || fail "Include not rewritten"
cmp -s "$ROOT/scripts/ssh_phc_hosts.conf" "$WIN_SSH_DIR/ssh_phc_hosts.conf" || fail "hosts file not copied"

# A generated config is overwritten without another backup.
"$HOOK" >/dev/null
backups=("$WIN_SSH_DIR"/config.bak.*)
[[ ${#backups[@]} -eq 1 ]] || fail "generated config was backed up again"

echo "PASS: windows ssh config hook"
