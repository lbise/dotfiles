#!/usr/bin/env bash
# Cheap, read-only confirmation labels for Hyprlock's periodic command widgets.
# The action/confirmation decision still lives in system-lock-power.py.
#
#   system-lock-power-status.sh reboot|poweroff
#   system-lock-power-status.sh reboot|poweroff --markup GLYPH_COLOUR ALERT_COLOUR
#
# Plain mode prints the label ("Restart", "Confirm Restart"). Markup mode
# prints Pango markup for Hyprlock: a Material Design glyph and the label,
# or "Confirm" in the alert colour while the action is armed.
set -u

usage() {
  echo 'Usage: system-lock-power-status.sh reboot|poweroff [--markup GLYPH_COLOUR ALERT_COLOUR]' >&2
  exit 2
}

case "${1:-}" in
  reboot) label=Restart glyph=$'\U000F0709' ;;
  poweroff) label='Shut down' glyph=$'\U000F0425' ;;
  *) usage ;;
esac

markup=''
if (($# == 4)) && [[ "$2" == --markup ]]; then
  # Colours are interpolated into markup, so accept only #RRGGBB.
  [[ "$3" =~ ^#[0-9A-Fa-f]{6}$ && "$4" =~ ^#[0-9A-Fa-f]{6}$ ]] || usage
  markup=1 glyph_colour=$3 alert_colour=$4
  # The shut-down glyph is always rose, as in the Quickshell power tiles.
  [[ "$1" == poweroff ]] && glyph_colour=$alert_colour
elif (($# != 1)); then
  usage
fi

file="${XDG_RUNTIME_DIR:-/run/user/$UID}/leo-lock-power.json"
state=''
armed=''
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
    armed_at=$((10#$seconds * 100 + 10#${fraction:0:2}))
    read -r uptime _ < /proc/uptime
    seconds=${uptime%.*}
    fraction=${uptime#*.}00
    now=$((10#$seconds * 100 + 10#${fraction:0:2}))
    age=$((now - armed_at))
    if ((age >= 0 && age < 300)); then
      armed=1
    fi
  fi
fi

if [[ -z "$markup" ]]; then
  [[ "$armed" == 1 ]] && label="Confirm $label"
  printf '%s\n' "$label"
else
  # Glyphs use the proportional Nerd Font slightly above text size, as in the
  # bar and the SDDM theme.
  icon="<span font_family=\"JetBrainsMono Nerd Font Propo\" size=\"115%\">$glyph</span>"
  if [[ "$armed" == 1 ]]; then
    printf '<span foreground="%s">%s Confirm</span>\n' "$alert_colour" "$icon"
  else
    printf '<span foreground="%s">%s</span> %s\n' "$glyph_colour" "$icon" "$label"
  fi
fi
