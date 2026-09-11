#!/usr/bin/env bash
# Verify SSH client discovery, including stale values inherited by Herdr panes.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
wrapper="$ROOT/scripts/herdr-ssh-bin/ssh"

assert_openssh() {
    local output
    if ! output=$("$@" 2>&1); then
        printf 'Expected OpenSSH, got: %s\n' "$output" >&2
        return 1
    fi
    [[ $output == OpenSSH_* ]]
}

# The wrapper is first in PATH inside Herdr. A bare command name must not
# resolve back to it, and a stale override must not hide installed OpenSSH.
export PATH="$(dirname "$wrapper"):$PATH"
assert_openssh env HERDR_REAL_SSH=ssh "$wrapper" -V
assert_openssh env HERDR_REAL_SSH="$TMP_DIR/missing" "$wrapper" -V
assert_openssh env HERDR_REAL_SSH= "$wrapper" -V
ln -s "$wrapper" "$TMP_DIR/ssh-link"
assert_openssh timeout 5 env HERDR_REAL_SSH="$TMP_DIR/ssh-link" "$wrapper" -V

# Valid explicit overrides and argument boundaries remain intact.
cat > "$TMP_DIR/custom ssh" <<'EOF'
#!/usr/bin/env bash
printf '<%s>\n' "$@"
EOF
chmod +x "$TMP_DIR/custom ssh"
output=$(HERDR_REAL_SSH="$TMP_DIR/custom ssh" "$wrapper" host 'echo two words')
[[ $output == $'<host>\n<echo two words>' ]]

# Exercise the shell launcher with an ssh function, which makes command -v
# return "ssh" rather than an executable path in both Bash and Zsh.
mkdir -p "$TMP_DIR/home/.scripts" "$TMP_DIR/bin"
ln -s "$(dirname "$wrapper")" "$TMP_DIR/home/.scripts/herdr-ssh-bin"
cat > "$TMP_DIR/home/.scripts/socklink.sh" <<'EOF'
#!/usr/bin/env bash
if [[ $1 == show ]]; then
    printf '/unused-agent-socket\n'
fi
EOF
chmod +x "$TMP_DIR/home/.scripts/socklink.sh"
ln -s socklink.sh "$TMP_DIR/home/.scripts/herdr-socklink.sh"
cat > "$TMP_DIR/bin/herdr" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${HERDR_REAL_SSH:-} == "${TEST_EXPECTED_SSH:-}" ]]
exec ssh -V
EOF
chmod +x "$TMP_DIR/bin/herdr"

for shell in bash zsh; do
    command -v "$shell" >/dev/null || continue
    assert_openssh env -u HERDR_REAL_SSH -u HERDR_ENV \
        HOME="$TMP_DIR/home" PATH="$TMP_DIR/bin:$PATH" \
        "$shell" -c 'ssh() { :; }; source "$1"; herdr' shell \
        "$ROOT/dot/.config/shell/ssh-auth-sock.sh"
done
printf 'Herdr SSH client tests passed\n'
