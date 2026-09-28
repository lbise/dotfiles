# Quickshell

The `leo-shell` configuration replaces Waybar with a single Quickshell bar.

Install Quickshell before starting Hyprland:

```bash
sudo pacman -S quickshell
```

Hyprland starts `leo-quickshell.service` from the user systemd manager. The
service runs `quickshell -n -p ~/.config/quickshell/leo-shell` and restarts it
if the process exits. The installer links the unit into
`~/.config/systemd/user/`; after first install, run
`systemctl --user daemon-reload`.

After system suspend, `hypridle` runs `system-restart-quickshell.sh` once the
monitor returns. It asks systemd to restart the service, including a frozen
instance whose graphics context did not survive suspend. To recover manually,
run `system-restart-quickshell.sh`. For logs, use
`journalctl --user -u leo-quickshell.service -b`. This restart does not require
logging out.

The bar has numbered workspaces on the left, a centered clock, and grouped
system controls on the right. The sea-glass highlight marks the active workspace;
the `Apps` button opens a drawer for third-party tray icons, with their names
alongside their original icons. Left-click activates an app, right-click opens
its tray menu, and middle-click uses its secondary action. Escape or a click
outside closes the drawer. Scroll to reach more apps; Shift+scroll sends wheel
input to an app that supports it. The single divider separates AI usage and
system stats from Bluetooth, audio, Wi-Fi, and battery. The battery appears only
when present and shows a charging symbol when connected to power. The bar also
has a system menu and a terminal
launcher for network tools.
Audio and Bluetooth open small interactive popups. Keep Walker installed for
application launching and clipboard history.

Click the CPU icon to show CPU usage, RAM, swap, load averages, and uptime.
The popup refreshes once per second while open. CPU usage needs two samples,
so it initially displays "Sampling…". RAM usage is total minus `MemAvailable`;
load averages cover 1, 5, and 15 minutes and are not percentages. Stats come
from Linux `/proc` files, with no extra packages or external commands.
Click outside, press Escape, or use the close button to dismiss it.

Click the clock to open a calendar. The arrows change month, Today returns to
the current month, and the current day is highlighted. Right-clicking the clock
also returns the calendar's month to today.

Click the Wi-Fi icon to see the connected network, signal, link rate, IP
address, and gateway. The popup scans for nearby networks. Open networks can
be selected directly. Secured networks reveal a password field, then connect
through NetworkManager with `nmcli`. Middle-click still opens Impala in a
terminal.

The printer icon, placed just after the divider, lists every CUPS queue with its
state, model, print jobs and network status. It turns red with an alert glyph
when a queue is paused, is rejecting jobs, or has jobs waiting for a printer
that doesn't answer. A number beside the icon counts queued jobs. Each printer
has Pause/Resume, and Cancel jobs appears while jobs are queued. Resume runs
`cupsenable` and `cupsaccept`. Middle-click or "Printer settings" opens
`system-config-printer`. The widget refreshes every minute, and every 5 seconds
while open.

Data comes from `scripts/system/system-printers.py status`, which prints JSON.
It checks reachability from the device URI. Host URIs (`ipp`, `socket`, `lpd`,
...) get a TCP connection to the print port, then a ping. Canon `cnijnet:/MAC`
URIs look up the MAC in `ip neigh` and ping that address. `dnssd://` URIs are
resolved with `avahi-browse`. USB and PDF queues show as local.

The `AI` widget has its own copied collectors in
`scripts/system/ai-usage-*.py`. The wrapper at
`scripts/system/ai-usage-update.sh` writes sanitized records to
`~/.local/state/leo/ai-usage/`. Local Pi/OpenCode session data provides tokens
by model. Codex quotas use the same ChatGPT usage endpoint and OAuth token
from `~/.pi/agent/auth.json` as the pi extension; the Codex CLI is only a
fallback. Other provider quotas require their own authentication. The widget
refreshes every 15 minutes and refreshes again when opened.
