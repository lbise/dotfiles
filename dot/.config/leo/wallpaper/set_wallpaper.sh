#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$1" ]; then
    echo "Usage: $0 IMAGE"
    exit 1
fi

CURR_WALLPAPER="$SCRIPT_DIR/current.jpg"
ln -sf "$1" "$CURR_WALLPAPER"
pkill -x swaybg
setsid uwsm-app -- swaybg -i "$CURR_WALLPAPER" -m fill >/dev/null 2>&1 &
