#!/usr/bin/env bash
# Verify that Herdr's SSH bridge refreshes the remote stable agent socket.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
agent_pid=
cleanup() {
    [[ -z $agent_pid ]] || kill "$agent_pid" 2>/dev/null || true
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

remote_home="$TMP_DIR/home"
fake_ssh="$TMP_DIR/ssh"
agent_sock="$TMP_DIR/agent.sock"
socklink_dir="$TMP_DIR/socklink"
mkdir -p "$remote_home/.local/bin" "$remote_home/.scripts" "$socklink_dir"
ln -s "$ROOT/scripts/herdr-socklink.sh" "$remote_home/.scripts/herdr-socklink.sh"

agent_pid=$(ssh-agent -a "$agent_sock" -s | awk -F '[=;]' '/SSH_AGENT_PID/ { print $2 }')
ssh-keygen -q -t ed25519 -N '' -f "$TMP_DIR/test-key"
SSH_AUTH_SOCK="$agent_sock" ssh-add "$TMP_DIR/test-key" >/dev/null 2>&1

# The real failure starts with this link resolving to an expired forwarded
# socket from an older SSH connection.
ln -s "$TMP_DIR/stale-agent.sock" "$socklink_dir/herdr"

cat > "$remote_home/.local/bin/herdr" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ $1 == remote-client-bridge ]]
link=$("$HOME/.scripts/herdr-socklink.sh" show)
[[ -S $link ]]
[[ $(readlink "$link") == "$SSH_AUTH_SOCK" ]]
SSH_AUTH_SOCK=$link ssh-add -l >/dev/null
printf 'bridge-agent=usable\n'
EOF
chmod +x "$remote_home/.local/bin/herdr"

cat > "$fake_ssh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
remote_command=${!#}
HOME=$TEST_REMOTE_HOME \
SSH_AUTH_SOCK=$TEST_AGENT_SOCK \
SOCKLINK_DIR=$TEST_SOCKLINK_DIR \
bash -c "$remote_command"
EOF
chmod +x "$fake_ssh"

output=$(
    HERDR_REAL_SSH="$fake_ssh" \
    TEST_REMOTE_HOME="$remote_home" \
    TEST_AGENT_SOCK="$agent_sock" \
    TEST_SOCKLINK_DIR="$socklink_dir" \
    "$ROOT/scripts/herdr-ssh-bin/ssh" machine \
    'exec "$HOME/.local/bin/herdr" remote-client-bridge'
)
[[ $output == bridge-agent=usable ]]
