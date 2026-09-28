#!/usr/bin/env bash
set -euo pipefail

# The monitor can still be disconnected immediately after resume. Don't stop a
# working bar until Hyprland has an output again.
ready=false
for ((attempt = 0; attempt < 20; attempt++)); do
  if hyprctl monitors -j 2>/dev/null | grep -Eq '"dpmsStatus"[[:space:]]*:[[:space:]]*true'; then
    ready=true
    break
  fi
  sleep 0.25
done
if [[ "$ready" != true ]]; then
  echo 'Quickshell restart skipped: display did not come back' >&2
  exit 1
fi

# systemd owns the bar. A restart waits for the previous process to exit (and
# forcibly stops it after TimeoutStopSec) before launching its replacement.
# Quickshell's -n flag would otherwise reject an overlapping instance.
systemctl --user restart leo-quickshell.service

# Type=exec means systemctl returns when Quickshell starts executing, before it
# registers its instance and creates the panel. Don't report success that early.
config="$HOME/.config/quickshell/leo-shell/shell.qml"
for ((attempt = 0; attempt < 50; attempt++)); do
  if systemctl --user is-active --quiet leo-quickshell.service &&
     quickshell list --all 2>/dev/null | grep -Fq "Config path: $config"; then
    exit 0
  fi
  sleep 0.1
done
echo 'Quickshell restart failed: service did not register a shell' >&2
exit 1
