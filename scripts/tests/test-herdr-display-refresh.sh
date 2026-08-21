#!/usr/bin/env bash
# Verify that an existing Herdr pane receives DISPLAY from a later client attach.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
HERDR_BIN=${HERDR_BIN:-$(command -v herdr)}

for command in "$HERDR_BIN" python3 script timeout zsh; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "SKIP: $command is required" >&2
        exit 77
    }
done

unset HERDR_ENV HERDR_SOCKET_PATH HERDR_PANE_ID
name="display-refresh-test-$RANDOM-$$"
tmp_dir=$(mktemp -d)
herdr() {
    "$HERDR_BIN" "$@"
}

cleanup() {
    stop_client
    herdr session stop "$name" >/dev/null 2>&1 || true
    herdr session delete "$name" >/dev/null 2>&1 || true
    rm -rf "$tmp_dir"
}
trap cleanup EXIT

client_pid=
start_client() {
    local display=$1
    timeout --signal=INT 10 script -qec \
        "stty cols 120 rows 40; env DISPLAY=$display zsh -ic 'source $ROOT/dot/.config/shell/ssh-auth-sock.sh; herdr --session $name'" \
        /dev/null >/dev/null 2>&1 &
    client_pid=$!
    sleep 0.5
}

stop_client() {
    [[ -n $client_pid ]] || return
    kill -INT "$client_pid" 2>/dev/null || true
    wait "$client_pid" 2>/dev/null || true
    client_pid=
}

pane_id() {
    local panes
    for _ in {1..20}; do
        panes=$(herdr --session "$name" pane list 2>/dev/null || true)
        if [[ -n $panes ]]; then
            python3 -c '
import json
import sys
print(json.load(sys.stdin)["result"]["panes"][0]["pane_id"])
' <<<"$panes" && return
        fi
        sleep 0.2
    done
    echo "Herdr did not start session $name" >&2
    return 1
}

wait_for_shell() {
    local process_info
    for _ in {1..20}; do
        process_info=$(herdr --session "$name" pane process-info --pane "$pane" 2>/dev/null || true)
        if python3 -c 'import json, sys; raise SystemExit(0 if json.load(sys.stdin)["result"]["process_info"]["foreground_processes"] else 1)' <<<"$process_info"; then
            return
        fi
        sleep 0.2
    done
    echo "Herdr did not start a shell in $pane" >&2
    return 1
}

read_display() {
    local marker=$1 output
    herdr --session "$name" pane run "$pane" "printf '$marker<%s>\\n' \"\$DISPLAY\""
    for _ in {1..20}; do
        output=$(herdr --session "$name" pane read "$pane" --source recent --lines 20 --raw)
        output=$(printf '%s' "$output" | sed -E $'s/\\x1B\\[[0-?]*[ -\\/]*[@-~]//g; s/\\r//g')
        if [[ $output =~ ${marker}\<([^\>]*)\> ]]; then
            printf '%s\n' "${BASH_REMATCH[1]}"
            return
        fi
        sleep 0.2
    done
    echo "Did not receive $marker from $pane. Pane output:" >&2
    printf '%s\n' "$output" >&2
    herdr --session "$name" pane process-info --pane "$pane" >&2 || true
    return 1
}

start_client old-display
stop_client
pane=$(pane_id)
wait_for_shell
herdr --session "$name" pane run "$pane" "source $ROOT/dot/.config/shell/herdr-display.sh"
sleep 0.2
before=$(read_display DISPLAY_BEFORE)
[[ $before == old-display ]] || {
    echo "Expected the first client DISPLAY, got '$before'" >&2
    exit 1
}

start_client new-display
stop_client
after=$(read_display DISPLAY_AFTER)
[[ $after == new-display ]] || {
    echo "DISPLAY remained '$after' after reattach, expected 'new-display'" >&2
    exit 1
}
