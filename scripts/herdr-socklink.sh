#!/usr/bin/env bash
# Point long-running Herdr panes at the SSH agent from the client that most
# recently started or attached to Herdr.
set -Eeuo pipefail

SOCKLINK_DIR="${SOCKLINK_DIR:-${SOCKLINK_TMPDIR:-/tmp}/socklink-$(id -u)}"
HERDR_LINK="$SOCKLINK_DIR/herdr"

usage() {
    echo "Usage: $(basename "$0") {set-current-tty|set-current-socket|set-client-environment|refresh|show}" >&2
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

write_client_environment() {
    local environment_dir environment_file temp_file variable

    environment_dir="${HERDR_ENVIRONMENT_DIR:-$HOME/.config/herdr}"
    environment_file="$environment_dir/client-environment.sh"
    mkdir -p "$environment_dir"
    if [[ ! -O "$environment_dir" ]]; then
        echo "Expected $environment_dir to be owned by the current user" >&2
        return 1
    fi

    umask 077
    temp_file=$(mktemp "$environment_dir/.client-environment.XXXXXX")
    trap 'rm -f "$temp_file"' EXIT
    for variable in DISPLAY WAYLAND_DISPLAY XAUTHORITY; do
        if [[ -v "$variable" ]]; then
            printf 'export %s=%q\n' "$variable" "${!variable}"
        else
            printf 'unset %s\n' "$variable"
        fi
    done >"$temp_file"
    mv -f "$temp_file" "$environment_file"
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
    write_client_environment
}

# Repair a dead link without stealing a live one. Prefer the agent forwarded by
# the Herdr GUI connection (herdr-core connect), which outlives short logins.
refresh() {
    local pid sock

    [[ -S "$HERDR_LINK" ]] && return 0
    for pid in $(pgrep -u "$(id -u)" -x herdr-core | sort -rn); do
        tr '\0' '\n' <"/proc/$pid/cmdline" 2>/dev/null | grep -qx connect || continue
        sock=$(tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | sed -n 's/^SSH_AUTH_SOCK=//p')
        if [[ -S "$sock" && -O "$sock" ]]; then
            set_current_target "$sock"
            return 0
        fi
    done
    if [[ -S "${SSH_AUTH_SOCK:-}" && -O "$SSH_AUTH_SOCK" ]]; then
        set_current_socket
    fi
}

case "${1:-}" in
    set-current-tty)
        set_current_tty
        ;;
    set-current-socket)
        set_current_socket
        ;;
    set-client-environment)
        write_client_environment
        ;;
    refresh)
        refresh
        ;;
    show)
        printf '%s\n' "$HERDR_LINK"
        ;;
    *)
        usage
        exit 2
        ;;
esac
