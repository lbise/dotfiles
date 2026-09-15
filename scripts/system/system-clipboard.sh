#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
    echo "usage: ${0##*/} copy|paste" >&2
    exit 2
fi

case "$1" in
    copy|paste) operation=$1 ;;
    *)
        echo "usage: ${0##*/} copy|paste" >&2
        exit 2
        ;;
esac

if ! active_window=$(hyprctl -j activewindow); then
    exit 1
fi

if ! window_info=$(jq -ser --arg ghostty 'com.mitchellh.ghostty' '
    if length != 1 or (.[0] | type) != "object" then
        error("activewindow did not return one object")
    elif .[0] == {} then
        "no-active-window"
    elif (.[0].address | type) != "string" then
        error("activewindow address is not a string")
    else
        [
            .[0].address,
            ((.[0].class == $ghostty) or (.[0].initialClass == $ghostty))
        ] | @tsv
    end
' <<<"$active_window"); then
    exit 1
fi

if [[ $window_info == no-active-window ]]; then
    exit 0
fi

IFS=$'\t' read -r address is_ghostty <<<"$window_info"
if [[ ! $address =~ ^0x[[:xdigit:]]+$ ]]; then
    exit 1
fi

if [[ $is_ghostty == true ]]; then
    case "$operation" in
        copy) modifier=CTRL; key=Insert ;;
        paste) modifier=SHIFT; key=Insert ;;
    esac
else
    modifier=CTRL
    case "$operation" in
        copy) key=c ;;
        paste) key=v ;;
    esac
fi

key_down=0
send_key_state() {
    hyprctl dispatch sendkeystate "$modifier, $key, $1, address:$address"
}
release_key() {
    local status=$?
    if (( key_down )); then
        hyprctl dispatch sendkeystate "$modifier, $key, up, address:$address" || true
        key_down=0
    fi
    return "$status"
}
trap release_key EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

send_key_state down
key_down=1
sleep 0.05
send_key_state up
key_down=0
trap - EXIT HUP INT TERM
