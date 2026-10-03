#!/usr/bin/env bash
# Cheap, read-only confirmation labels for Hyprlock's periodic command widgets.
# The action/confirmation decision still lives in system-lock-power.py.
#
#   system-lock-power-status.sh reboot|poweroff
#   system-lock-power-status.sh pending --markup ALERT_COLOUR
#
# Plain mode prints the label ("Restart", "Confirm Restart"). Pending mode
# prints the Pango markup Hyprlock shows under its bar while restart or
# shutdown waits for the second click, and an empty line otherwise.
set -u

usage() {
  echo 'Usage: system-lock-power-status.sh reboot|poweroff | pending --markup ALERT_COLOUR' >&2
  exit 2
}

markup=''
case "${1:-}" in
  reboot) label=Restart ;;
  poweroff) label='Shut down' ;;
  pending)
    # Colours are interpolated into markup, so accept only #RRGGBB.
    (($# == 3)) && [[ "$2" == --markup && "$3" =~ ^#[0-9A-Fa-f]{6}$ ]] || usage
    markup=1 alert_colour=$3
    ;;
  *) usage ;;
esac
[[ -n "$markup" ]] || (($# == 1)) || usage

file="${XDG_RUNTIME_DIR:-/run/user/$UID}/leo-lock-power.json"
state=''
armed=''
if [[ -f "$file" && ! -L "$file" ]]; then
  # The writer may briefly truncate the file; an empty read just shows the
  # ordinary label. No process or state changes occur in this reader.
  IFS= read -r state < "$file" || true
fi

if [[ "$state" =~ \"action\"[[:space:]]*:[[:space:]]*\"(reboot|poweroff)\" ]] \
    && { [[ -n "$markup" ]] || [[ "${BASH_REMATCH[1]}" == "$1" ]]; } \
    && action=${BASH_REMATCH[1]} \
    && [[ "$state" =~ \"at\"[[:space:]]*:[[:space:]]*([0-9]+)(\.([0-9]+))? ]]; then
  seconds=${BASH_REMATCH[1]}
  fraction=${BASH_REMATCH[3]:-0}00
  # Limit malformed values before shell arithmetic. Timestamps are in seconds
  # since boot. Two decimal places match the precision of /proc/uptime.
  if [[ ${#seconds} -le 10 ]]; then
    armed_at=$((10#$seconds * 100 + 10#${fraction:0:2}))
    read -r uptime _ < /proc/uptime
    seconds=${uptime%.*}
    fraction=${uptime#*.}00
    now=$((10#$seconds * 100 + 10#${fraction:0:2}))
    age=$((now - armed_at))
    # The writer accepts the second click for three seconds.
    if ((age >= 0 && age < 300)); then
      armed=1
    fi
  fi
fi

if [[ -z "$markup" ]]; then
  [[ "$armed" == 1 ]] && label="Confirm $label"
  printf '%s\n' "$label"
elif [[ "$armed" == 1 ]]; then
  # The alert glyph uses the proportional Nerd Font slightly above text size.
  icon="<span font_family=\"JetBrainsMono Nerd Font Propo\" size=\"115%\">"$'\U000F0026'"</span>"
  case "$action" in
    reboot) verb=restart ;;
    poweroff) verb='shut down' ;;
  esac
  printf '<span foreground="%s">%s Click again to %s</span>\n' "$alert_colour" "$icon" "$verb"
else
  echo
fi
