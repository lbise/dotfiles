#!/usr/bin/env bash
# Verify that a long-running Herdr shell picks up connection changes from bridges.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
agent_pid=
cleanup() {
    [[ -z $agent_pid ]] || kill "$agent_pid" 2>/dev/null || true
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

for command in ssh-agent zsh; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "SKIP: $command is required" >&2
        exit 77
    }
done

home="$TMP_DIR/home"
socklink_dir="$TMP_DIR/socklink"
agent_sock="$TMP_DIR/agent.sock"
stale_agent_sock="$TMP_DIR/stale-agent.sock"
environment_dir="$home/.config/herdr"
mkdir -p "$environment_dir" "$home/.scripts"
ln -s "$ROOT/scripts/herdr-socklink.sh" "$home/.scripts/herdr-socklink.sh"
agent_pid=$(ssh-agent -a "$agent_sock" -s | awk -F '[=;]' '/SSH_AGENT_PID/ { print $2 }')

HOME="$home" \
DISPLAY=old-display \
SSH_AUTH_SOCK="$agent_sock" \
SOCKLINK_DIR="$socklink_dir" \
HERDR_ENVIRONMENT_DIR="$environment_dir" \
    "$ROOT/scripts/herdr-socklink.sh" set-current-socket

HOME="$home" \
HERDR_ENV=1 \
SOCKLINK_DIR="$socklink_dir" \
HERDR_SOCKET_PATH="$environment_dir/herdr.sock" \
TEST_AGENT_SOCK="$agent_sock" \
TEST_ENVIRONMENT_DIR="$environment_dir" \
TEST_SOCKLINK_DIR="$socklink_dir" \
TEST_STALE_AGENT_SOCK="$stale_agent_sock" \
SSH_AUTH_SOCK="$stale_agent_sock" \
TEST_ROOT="$ROOT" \
zsh -fic '
    setopt errexit
    source "$TEST_ROOT/dot/.config/shell/herdr-display.sh"
    [[ $DISPLAY == old-display ]]
    [[ $SSH_AUTH_SOCK == "$TEST_SOCKLINK_DIR/herdr" && -S $SSH_AUTH_SOCK ]]
    [[ " ${precmd_functions[*]} " == *" herdr_sync_connection_environment "* ]]
    [[ " ${preexec_functions[*]} " == *" herdr_sync_connection_environment "* ]]

    SSH_AUTH_SOCK=$TEST_STALE_AGENT_SOCK
    herdr_sync_connection_environment
    [[ $SSH_AUTH_SOCK == "$TEST_SOCKLINK_DIR/herdr" && -S $SSH_AUTH_SOCK ]]

    env -u WAYLAND_DISPLAY -u XAUTHORITY \
        HOME="$HOME" DISPLAY=new-display SSH_AUTH_SOCK="$TEST_AGENT_SOCK" \
        SOCKLINK_DIR="$TEST_SOCKLINK_DIR" \
        HERDR_ENVIRONMENT_DIR="$TEST_ENVIRONMENT_DIR" \
        "$TEST_ROOT/scripts/herdr-socklink.sh" set-current-socket
    [[ $DISPLAY == old-display ]]
    herdr_sync_connection_environment
    [[ $DISPLAY == new-display ]]

    env -u DISPLAY -u WAYLAND_DISPLAY -u XAUTHORITY \
        HOME="$HOME" SSH_AUTH_SOCK="$TEST_AGENT_SOCK" \
        SOCKLINK_DIR="$TEST_SOCKLINK_DIR" \
        HERDR_ENVIRONMENT_DIR="$TEST_ENVIRONMENT_DIR" \
        "$TEST_ROOT/scripts/herdr-socklink.sh" set-current-socket
    herdr_sync_connection_environment
    [[ ! -v DISPLAY && ! -v WAYLAND_DISPLAY && ! -v XAUTHORITY ]]
'

printf 'Herdr display refresh tests passed\n'
