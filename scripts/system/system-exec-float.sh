#!/usr/bin/env bash
# Run a TUI in a floating terminal (see the org.leo.menu window rule in hyprland.conf).
# Usage: system-exec-float.sh <title> <command> [args..]

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <title> <command> [args..]"
    exit 1
fi

TITLE="$1"
shift

exec setsid uwsm-app -- xdg-terminal-exec --app-id=org.leo.menu --title="$TITLE" -e "$@"
