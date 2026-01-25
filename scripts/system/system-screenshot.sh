#!/usr/bin/env bash

OUTPUT_DIR="$HOME/screenshots"

if [[ ! -d "$OUTPUT_DIR" ]]; then
    mkdir -p $OUTPUT_DIR
fi

MODE="fullscreen"
# Change to edit
PROCESSING="nothing"

case "$MODE" in
#  region)
#    wayfreeze & PID=$!
#    sleep .1
#    SELECTION=$(slurp 2>/dev/null)
#    kill $PID 2>/dev/null
#    ;;
#  windows)
#    wayfreeze & PID=$!
#    sleep .1
#    SELECTION=$(get_rectangles | slurp -r 2>/dev/null)
#    kill $PID 2>/dev/null
#    ;;
  fullscreen)
    SELECTION=$(hyprctl monitors -j | jq -r '.[] | select(.focused == true) | "\(.x),\(.y) \((.width / .scale) | floor)x\((.height / .scale) | floor)"')
    ;;
#  smart|*)
#    RECTS=$(get_rectangles)
#    wayfreeze & PID=$!
#    sleep .1
#    SELECTION=$(echo "$RECTS" | slurp 2>/dev/null)
#    kill $PID 2>/dev/null
#
#    # If the selction area is L * W < 20, we'll assume you were trying to select whichever
#    # window or output it was inside of to prevent accidental 2px snapshots
#    if [[ "$SELECTION" =~ ^([0-9]+),([0-9]+)[[:space:]]([0-9]+)x([0-9]+)$ ]]; then
#      if (( ${BASH_REMATCH[3]} * ${BASH_REMATCH[4]} < 20 )); then
#        click_x="${BASH_REMATCH[1]}"
#        click_y="${BASH_REMATCH[2]}"
#
#        while IFS= read -r rect; do
#          if [[ "$rect" =~ ^([0-9]+),([0-9]+)[[:space:]]([0-9]+)x([0-9]+) ]]; then
#            rect_x="${BASH_REMATCH[1]}"
#            rect_y="${BASH_REMATCH[2]}"
#            rect_width="${BASH_REMATCH[3]}"
#            rect_height="${BASH_REMATCH[4]}"
#
#            if (( click_x >= rect_x && click_x < rect_x+rect_width && click_y >= rect_y && click_y < rect_y+rect_height )); then
#              SELECTION="${rect_x},${rect_y} ${rect_width}x${rect_height}"
#              break
#            fi
#          fi
#        done <<< "$RECTS"
#      fi
#    fi
#    ;;
esac

[ -z "$SELECTION" ] && exit 0

#if [[ $PROCESSING == "slurp" ]]; then
#grim -g "$SELECTION" - |
#  satty --filename - \
#    --output-filename "$OUTPUT_DIR/screenshot-$(date +'%Y-%m-%d_%H-%M-%S').png" \
#    --early-exit \
#    --actions-on-enter save-to-clipboard \
#    --save-after-copy \
#    --copy-command 'wl-copy'
#else
#  grim -g "$SELECTION" - | wl-copy
#fi

FILENAME="$OUTPUT_DIR/screenshot-$(date +'%Y-%m-%d_%H-%M-%S').png"

if [[ $PROCESSING == "edit" ]]; then
    # Screenshot + edit
    grim -g "$SELECTION" - |
      satty --filename - \
        --output-filename "$FILENAME" \
        --early-exit \
        --actions-on-enter save-to-clipboard \
        --save-after-copy \
        --copy-command 'wl-copy'

    notify-send "Screenshot saved to $FILENAME"
else
    grim -g "$SELECTION" - | wl-copy
    notify-send "Screenshot saved to clipboard"
fi

