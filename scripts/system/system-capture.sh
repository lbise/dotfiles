#!/usr/bin/env bash
# Capture something from the screen.
# Usage: system-capture.sh text|color
#   text   OCR a selected region and copy the text (needs tesseract; languages from
#          $LEO_OCR_LANGS, default "eng")
#   color  pick a color from the screen and copy it as hex (needs hyprpicker)
set -Eeuo pipefail

notify() {
    notify-send -a system-capture "$@"
}

need() {
    command -v "$1" >/dev/null 2>&1 && return 0
    notify -u critical "Missing $1" "Install it, then try again."
    exit 1
}

capture_text() {
    need tesseract
    local selection text
    selection=$(slurp 2>/dev/null) || exit 0
    [[ -n $selection ]] || exit 0

    text=$(grim -g "$selection" - | tesseract stdin stdout --oem 1 --psm 6 \
        -l "${LEO_OCR_LANGS:-eng}" --dpi 300 -c preserve_interword_spaces=1 2>/dev/null) || true
    if [[ -z ${text//[[:space:]]/} ]]; then
        notify "No text found"
        exit 1
    fi
    printf '%s' "$text" | wl-copy
    notify "Copied text" "$(head -c 120 <<<"$text")"
}

capture_color() {
    need hyprpicker
    local color
    color=$(hyprpicker --format=hex) || exit 0
    [[ -n $color ]] || exit 0
    printf '%s' "$color" | wl-copy
    notify "Copied color" "$color"
}

case ${1:-} in
    text) capture_text ;;
    color) capture_color ;;
    *) echo "Usage: $0 text|color" >&2; exit 2 ;;
esac
