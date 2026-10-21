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

The bar floats 8px below the top edge and 10px from the sides, the same gap
Hyprland leaves around windows. It has the Arch logo menu and workspaces 1 to 8
on the left, the clock in the centre, and status controls on the right. The
accent marks the current workspace. Scroll over the workspaces to move between
them. A divider separates AI usage and system stats from printers, Bluetooth,
sound, network and battery. The battery appears only when present and shows a
charging symbol when connected to power. Keep Walker installed for application
launching and clipboard history.

Colours, font and corner radius come from `~/.config/leo/theme/palette.json`
(see `../leo/theme/README.md`). The bar reloads them when the file changes.
`DESIGN.md` at the repository root describes the visual rules.

Every control opens a popup under its button. Only one popup is open at a
time: Escape or a click elsewhere closes it, and clicking another bar button
switches to that popup. Keybinds can open them through IPC, for example
`quickshell ipc -p ~/.config/quickshell/leo-shell call leo.popup toggle audio`.
The ids are `menu`, `calendar`, `ai`, `sys`, `printers`, `bluetooth`, `audio`,
`wifi`, `garmin`, `media`, `notifications` and `apps`. The popups are built from shared components in `leo-shell/`
(`PopupCard`, `Section`, `ListRow`, `Meter`, `PillSlider`, `PillButton` and
others); `Theme`, `Icons` and `Popups` are singletons. After adding a new
singleton, restart the service: a hot reload does not register it.

The Arch logo opens Applications (Walker), Clipboard, and session buttons:
Lock, Suspend, Log out, Restart and Shut down. Log out, Restart and Shut down
need a second click within three seconds.

The sound popup sets output and input volume and picks the output device
through PipeWire. Mixer opens `pavucontrol`. On the bar icon, right-click mutes
and scrolling changes the volume.

The Bluetooth popup lists connected and paired devices, with battery level when
the device reports it. Click a device to connect or disconnect it. Scan shows
nearby devices to pair until the popup closes. Settings, or a middle-click on
the bar icon, opens `bluetui` in a terminal.

The chevron at the right end opens the background apps (tray items), with their
names alongside their original icons. Left-click activates an app, right-click
shows its menu inside the popup (the arrow goes back, and submenus open in
place), and middle-click uses its secondary action. Shift+scroll
sends wheel input to an app that supports it. A dot on the chevron means an app
needs attention. The network applet and the input method are hidden because
the bar covers them; edit `hiddenIds` in `Tray.qml` to change the list.

Click the CPU icon to open System. It shows uptime under the title, then
processor usage and load, CPU and GPU temperatures, RAM and swap, and one
section per physical drive. A drive section is titled with the model and shows
its temperature, then transport, SSD or HDD, size and device name. Each mounted
filesystem on it gets a usage bar labelled with its mount points, including
ones behind LUKS or LVM. Swap partitions and unmounted partitions are listed
below the bars. The drive holding `/` comes first. Loop and zram devices are
left out, and so are network and other mounts without a block device.
Usage, RAM and load refresh every second and drives and temperatures every
5 seconds, only while the popup is open. Usage needs two samples, so it shows
"…" for the first second. RAM is total minus `MemAvailable`. Load is the 1 minute
average divided by the core count, so a full bar means every core is busy; the
5 and 15 minute averages are listed below it. Readings come from `/proc`, the
temperatures from `/sys/class/hwmon` (`k10temp`/`coretemp` and `amdgpu`),
drive temperatures from the hwmon device under `/sys/block/<drive>/device`
(`nvme`, or `drivetemp` for SATA once that module is loaded), and drives from
`lsblk`. A temperature is hidden when its sensor is missing.
Click outside, press Escape, or use the close button to dismiss it.

Click the clock to open a calendar. The arrows change month, Today returns to
the current month, and the current day is highlighted. Right-clicking the clock
also returns the calendar's month to today.

The network icon shows Wi-Fi signal strength, or an ethernet icon when the
machine is wired and Wi-Fi is not connected. Click it to see the connection,
its address and gateway, and the Wi-Fi networks nearby; the popup scans when it
opens and has a switch for the Wi-Fi radio. Open networks connect directly.
Secured networks expand a password field, then connect through NetworkManager
with `nmcli`. Middle-click opens Impala in a terminal.

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

A watch icon appears after Bluetooth while a Garmin watch (USB vendor `091e`)
is plugged in. Its popup shows storage and the music on the watch by artist.
Click an artist to list its tracks; click a track to show Edit and Delete.
Delete artist and Delete track need a second click ("Confirm") within three
seconds.

The watch's player shows tags (artist, title, album), not folder names, so
every upload is tagged. Add music opens a `zenity` file picker, then the popup
comes back with one row per file: Title, Artist and Album, filled from the
file's tags, then from its name ("01. Artist - Title (Official Video)" gives
Artist and Title; downloader prefixes, bitrates and YouTube ids are dropped).
All files sets the artist and album of every row at once. Add writes the tags
into a temporary copy with `ffmpeg`, never into the original file: MP3 gets
ID3v2.3, M4A MP4 tags; raw AAC is remuxed to M4A, and FLAC, Ogg, Opus and WAV
are converted to MP3 (LAME V2). The copy goes to
`Music/<Artist>/<Album>/<Title>.mp3`, the watch's own layout, with "Unknown
Artist" and "Unknown" for empty fields. A file already on the watch is skipped.
Closing the popup keeps the list; a dot on the icon means it is waiting.

Edit on a track downloads it to read its tags (about 3 MB/s, so a two-hour
mix takes a minute), then Save writes the new tags and uploads it to the path
they give. The original is deleted only after the new copy has arrived with
the right size, and emptied album and artist folders are removed. When the
path does not change, the original is renamed aside while the copy uploads,
and renamed back if the upload fails. Edit artist retags every track of an
artist (and optionally sets one album), keeping each title. The bar shows the
progress of an upload or retag, and turns red if a file fails until the popup
has been opened and closed.

KDE's `kmtpd` (inside `kiod6`) holds the watch's USB interface, so libmtp
tools report it as busy. `scripts/system/system-garmin-music.py` uses kmtpd's
D-Bus API instead (`org.kde.kmtpd5`, started on demand), which lets Dolphin
browse the watch at the same time. Its `watch` command stays running and
reports plug and unplug from udev and kmtpd's `devicesChanged` signal, without
polling. `list`, `probe`, `probe-remote`, `add`, `retag` and `rm` print JSON
(see the script's usage); `add` and `retag` take a JSON manifest on stdin, and
`retag` and `rm` only accept paths inside `/Music`. A download made to read
tags is kept for an hour in `~/.cache/leo/garmin-music/` so Save does not
download it again.

The AI usage widget (robot icon) has its own copied collectors in
`scripts/system/ai-usage-*.py`. The wrapper at
`scripts/system/ai-usage-update.sh` writes sanitized records to
`~/.local/state/leo/ai-usage/`. Local Pi/OpenCode session data provides tokens
by model. Codex quotas use the same ChatGPT usage endpoint and OAuth token
from `~/.pi/agent/auth.json` as the pi extension; the Codex CLI is only a
fallback. Claude plan limits use Claude Code's login in
`~/.claude/.credentials.json` if it is valid, otherwise pi's Anthropic login
from the same `auth.json`. The collector only reads pi's token; pi refreshes it
when it runs. Other provider quotas require their own authentication. The widget
refreshes every 15 minutes and refreshes again when opened.

Star a provider in the popup to pin it to the top. The bar then shows that
provider's highest quota instead of the highest overall. The choice is saved
in `~/.local/state/leo/ai-usage/favorite`. Updates change the popup in place,
so the meters do not redraw when data refreshes.

## Notifications, Keep awake and media

The bell opens the notification history from mako, read through `makoctl`
(`Mako.qml` polls every 5 seconds). The number beside the bell counts
notifications that arrived since the popup was last open. Long notifications
are cut to two lines; click one to show all of it, click again to collapse.
The copy button on a hovered or expanded notification puts its summary and
body on the clipboard with `wl-copy`. Right-click the bell,
or use the switch in the popup, to turn Do not disturb on; critical
notifications still show. The mode and `max-history=30` live in
`dot/.config/mako/config`. Mako cannot clear its history, so the popup only
offers Dismiss all for notifications still on screen.

Keep awake is a row in the Arch menu. It holds a `systemd-inhibit --what=idle`
lock, which hypridle honours, so the screen does not lock or turn off (manual
lock and suspend still work). A coffee icon appears in the bar while it is on;
click it to turn it off. It turns off when the shell restarts.

The media button appears while an MPRIS player (browser, Spotify, mpv) has a
track. It shows the title; right-click plays or pauses and middle-click skips.
The popup has the cover, a seek bar, previous, play and next, and a player
list when several are open. After adding `Mako.qml` or `Caffeine.qml`, restart
the service, as these are singletons.
