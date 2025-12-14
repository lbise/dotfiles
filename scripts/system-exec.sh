#!/usr/bin/env bash

if [[ -z $1 ]]; then
    echo "Usage: $0 <path> [args..]"
    exit 1
fi

APP="$1"

exec setsid uwsm-app -- xdg-terminal-exec --app-id=org.leo.$(basename $1) -e "$APP" "${@:2}"
