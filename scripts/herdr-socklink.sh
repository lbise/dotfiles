#!/usr/bin/env bash
# Point long-running Herdr panes at the SSH agent from the client that most
# recently started or attached to Herdr.
set -Eeuo pipefail

SOCKLINK_DIR="${SOCKLINK_DIR:-${SOCKLINK_TMPDIR:-/tmp}/socklink-$(id -u)}"
HERDR_LINK="$SOCKLINK_DIR/herdr"

usage() {
    echo "Usage: $(basename "$0") {set-current-tty|set-current-socket|show}" >&2
}

set_current_target() {
    local target=$1 temp_dir temp_link

    mkdir -p -m 700 "$SOCKLINK_DIR"
    if [[ ! -O "$SOCKLINK_DIR" ]]; then
        echo "Expected $SOCKLINK_DIR to be owned by the current user" >&2
        return 1
    fi
    chmod 700 "$SOCKLINK_DIR"

    # Atomic replacement keeps existing Herdr panes from briefly seeing a
    # missing SSH_AUTH_SOCK while another client attaches. A temporary
    # directory avoids collisions with files left by a killed process.
    temp_dir=$(mktemp -d "$SOCKLINK_DIR/.herdr.XXXXXX")
    temp_link="$temp_dir/link"
    trap 'rm -rf "$temp_dir"' EXIT
    ln -s "$target" "$temp_link"
    mv -f "$temp_link" "$HERDR_LINK"
    rmdir "$temp_dir"
    trap - EXIT
}

set_current_tty() {
    local tty_path tty_name tty_link

    tty_path=$(tty)
    if [[ "$tty_path" != /dev/* || "$tty_path" == *['+ ']* ]]; then
        echo "Unsupported tty path: $tty_path" >&2
        return 1
    fi

    tty_name=${tty_path#/}
    tty_name=${tty_name//\//+}
    tty_link="$SOCKLINK_DIR/ttys/$tty_name"
    set_current_target "$tty_link"
}

set_current_socket() {
    if [[ -z "${SSH_AUTH_SOCK:-}" || ! -S "$SSH_AUTH_SOCK" || ! -O "$SSH_AUTH_SOCK" ]]; then
        echo "SSH_AUTH_SOCK does not name a socket owned by the current user" >&2
        return 1
    fi

    set_current_target "$SSH_AUTH_SOCK"
}

case "${1:-}" in
    set-current-tty)
        set_current_tty
        ;;
    set-current-socket)
        set_current_socket
        ;;
    show)
        printf '%s\n' "$HERDR_LINK"
        ;;
    *)
        usage
        exit 2
        ;;
esac
