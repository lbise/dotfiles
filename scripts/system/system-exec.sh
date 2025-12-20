#!/usr/bin/env bash

if [[ -z $1 ]]; then
    echo "Usage: $0 <path> [args..]"
    exit 1
fi

APP="$1"

eval exec setsid uwsm-app -- "$APP" "${@:2}"
