#!/usr/bin/env bash
# Preview the installed Plymouth splash without rebooting.
#
# Run it from a text console, not from Hyprland (Hyprland owns the display):
# press Ctrl+Alt+F3, log in, run this script, then return with Ctrl+Alt+F1
# (or whichever console your session is on).
#
#   bash scripts/system/system-boot-preview.sh [SECONDS]
#
# Shows the animation for SECONDS (default 12), then the passphrase box: type
# anything and press Enter (the text is discarded). The splash then closes.
#
# plymouthd only uses a graphical theme when the kernel command line has
# "splash", so the preview passes a fake one; that way it works before the
# first reboot with the new boot options. It also uses this console rather
# than tty1, where the desktop session may run. plymouthd does not log to the
# journal: its debug output goes to $LOG.
set -Eeuo pipefail

seconds=${1:-12}
LOG=/tmp/plymouth-preview.log

[[ "$(tty)" == /dev/tty* ]] || {
    echo "Run this from a text console (Ctrl+Alt+F3), not from a terminal window." >&2
    exit 1
}
command -v plymouthd >/dev/null || {
    echo "plymouth is not installed; run system-boot-install.sh first." >&2
    exit 1
}

sudo -v
cleanup() { sudo plymouth quit 2>/dev/null || true; }
trap cleanup EXIT

# A leftover daemon from an earlier run would keep the new one from starting.
if pgrep -x plymouthd >/dev/null; then
    sudo plymouth quit 2>/dev/null || sudo pkill -x plymouthd || true
    sleep 1
fi

sudo plymouthd --tty="$(tty)" --kernel-command-line="quiet splash" \
    --debug --debug-file="$LOG"
sudo plymouth show-splash
sleep "$seconds"
sudo plymouth ask-for-password --prompt "preview" >/dev/null || true
sleep 2
sudo plymouth quit
trap - EXIT
sudo chmod a+r "$LOG" 2>/dev/null || true
echo "Debug log: $LOG"
