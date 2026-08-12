#!/usr/bin/env bash
# Point long-running Herdr panes at the SSH agent from the client that most
# recently started or attached to Herdr.
set -Eeuo pipefail

SOCKLINK_DIR="${SOCKLINK_DIR:-${SOCKLINK_TMPDIR:-/tmp}/socklink-$(id -u)}"
HERDR_LINK="$SOCKLINK_DIR/herdr"

usage() {
    echo "Usage: $(basename "$0") {set-current-tty|show}" >&2
}

set_current_tty() {
    local tty_path tty_name tty_link temp_link

    tty_path=$(tty)
    if [[ "$tty_path" != /dev/* || "$tty_path" == *['+ ']* ]]; then
        echo "Unsupported tty path: $tty_path" >&2
        return 1
    fi

    tty_name=${tty_path#/}
    tty_name=${tty_name//\//+}
    tty_link="$SOCKLINK_DIR/ttys/$tty_name"

    mkdir -p -m 700 "$SOCKLINK_DIR"
    if [[ ! -O "$SOCKLINK_DIR" ]]; then
        echo "Expected $SOCKLINK_DIR to be owned by the current user" >&2
        return 1
    fi
    chmod 700 "$SOCKLINK_DIR"

    # Atomic replacement keeps existing Herdr panes from briefly seeing a
    # missing SSH_AUTH_SOCK while another client attaches.
    temp_link="$SOCKLINK_DIR/.herdr.$$"
    trap 'rm -f "$temp_link"' EXIT
    ln -s "$tty_link" "$temp_link"
    mv -f "$temp_link" "$HERDR_LINK"
    trap - EXIT
}

case "${1:-}" in
    set-current-tty)
        set_current_tty
        ;;
    show)
        printf '%s\n' "$HERDR_LINK"
        ;;
    *)
        usage
        exit 2
        ;;
esac
