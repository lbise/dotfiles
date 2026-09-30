#!/usr/bin/env bash
# Cheap, read-only confirmation labels for Hyprlock's periodic command widgets.
# The action/confirmation decision still lives in system-lock-power.py.
set -u

case "${1:-}" in
  reboot) label=Restart ;;
  poweroff) label='Shut down' ;;
  *) echo 'Usage: system-lock-power-status.sh reboot|poweroff' >&2; exit 2 ;;
esac

file="${XDG_RUNTIME_DIR:-/run/user/$UID}/leo-lock-power.json"
state=''
if [[ -f "$file" && ! -L "$file" ]]; then
  # The writer may briefly truncate the file; an empty read just shows the
  # ordinary label. No process or state changes occur in this reader.
  IFS= read -r state < "$file" || true
fi

if [[ "$state" =~ \"action\"[[:space:]]*:[[:space:]]*\"(reboot|poweroff)\" ]] \
    && [[ "${BASH_REMATCH[1]}" == "$1" ]] \
    && [[ "$state" =~ \"at\"[[:space:]]*:[[:space:]]*([0-9]+)(\.([0-9]+))? ]]; then
  seconds=${BASH_REMATCH[1]}
  fraction=${BASH_REMATCH[3]:-0}00
  # Limit malformed values before shell arithmetic. Timestamps are in seconds
  # since boot. Two decimal places match the precision of /proc/uptime.
  if [[ ${#seconds} -le 10 ]]; then
    armed=$((10#$seconds * 100 + 10#${fraction:0:2}))
    read -r uptime _ < /proc/uptime
    seconds=${uptime%.*}
    fraction=${uptime#*.}00
    now=$((10#$seconds * 100 + 10#${fraction:0:2}))
    age=$((now - armed))
    if ((age >= 0 && age < 300)); then
      label="Confirm $label"
    fi
  fi
fi
printf '%s\n' "$label"
