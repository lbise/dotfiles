#!/usr/bin/env bash
# Screenshot walker menus without touching the desktop you are working on.
#
# Usage: render-walker-menus.sh OUTDIR SPEC [SPEC...]
#   SPEC is MENU, or MENU:Key,Key to press keys (wtype names) before the screenshot.
#   e.g. render-walker-menus.sh /tmp/shots leo setup leo:Return,Escape
#   The screenshot is OUTDIR/MENU.png, or OUTDIR/MENU+Key+Key.png when keys are given.
#
# It adds a virtual Hyprland output far to the right, runs a nested Hyprland there
# (a real output gets frame callbacks; a window on a hidden workspace does not, and
# grim would hang), opens each `walker -m menus:MENU` inside it on a private D-Bus
# session and grabs OUTDIR/MENU.png. Your focus and workspaces are left alone. The
# virtual output and nested compositor are removed on exit, even on failure.
set -Eeuo pipefail

if (($# < 2)); then
    sed -n '2,/^set /p' "$0" | sed '$d;s/^# \{0,1\}//'
    exit 2
fi

OUT=$1
shift
mkdir -p "$OUT"
WORK=$(mktemp -d)
MONITOR=leo-render
NESTED_CONF="$WORK/hypr.conf"
printf '%s\n' 'monitor = , 1600x1400@60, 0x0, 1' 'misc { disable_hyprland_logo = true; vfr = true }' > "$NESTED_CONF"

cleanup() {
    pkill -f "^Hyprland -c $NESTED_CONF" 2>/dev/null || true
    sleep 1
    hyprctl output remove "$MONITOR" >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

sockets() { find "$XDG_RUNTIME_DIR" -maxdepth 1 -name 'wayland-[0-9]*' ! -name '*.lock' -printf '%f\n' | sort; }

hyprctl output create headless "$MONITOR" >/dev/null
sleep 1
hyprctl keyword monitor "$MONITOR,1700x1500@60,20000x0,1" >/dev/null
hyprctl keyword workspace "98,monitor:$MONITOR,default:true" >/dev/null

before=$(sockets)
hyprctl dispatch exec "[workspace 98 silent; float; size 1600 1400; move 20050 50] env HYPRLAND_NO_CRASHREPORTER=1 Hyprland -c $NESTED_CONF" >/dev/null
sleep 5

# The virtual output's active workspace is not necessarily 98; put the window on the visible one.
ws=$(hyprctl monitors -j | jq -r --arg m "$MONITOR" '.[] | select(.name == $m) | .activeWorkspace.id')
hyprctl dispatch movetoworkspacesilent "$ws,class:aquamarine" >/dev/null
sleep 1
hyprctl dispatch movewindowpixel "exact 20050 50,class:aquamarine" >/dev/null
sleep 2

nested=$(comm -13 <(echo "$before") <(sockets) | head -1)
[[ -n $nested ]] || { echo "nested compositor did not start" >&2; exit 1; }

export WAYLAND_DISPLAY=$nested GTK_A11Y=none NO_AT_BRIDGE=1 GTK_USE_PORTAL=0
export SHOT_DIR=$OUT

for spec in "$@"; do
    menu=${spec%%:*}
    keys=""
    [[ $spec == *:* ]] && keys=${spec#*:}
    name=$menu
    [[ -n $keys ]] && name="$menu+${keys//,/+}"
    export SHOT_MENU=$menu SHOT_KEYS=$keys SHOT_NAME=$name
    # Kill by PID: `pkill -x walker` would also take down the walker service you are using.
    timeout 40 dbus-run-session -- bash -c '
        walker --gapplication-service >/dev/null 2>&1 &
        service=$!
        sleep 2
        walker -m "menus:$SHOT_MENU" --minheight 1 --maxheight 630 >/dev/null 2>&1 &
        client=$!
        sleep 2.5
        for key in ${SHOT_KEYS//,/ }; do wtype -k "$key"; sleep 1; done
        timeout 10 grim "$SHOT_DIR/$SHOT_NAME.png"
        wtype -k Escape
        sleep 0.5
        kill "$client" "$service" 2>/dev/null || true' >/dev/null 2>&1 || true
    [[ -f $OUT/$name.png ]] && echo "$OUT/$name.png" || echo "no screenshot for $name" >&2
done
