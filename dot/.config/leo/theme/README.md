# Theme

`palette.json` is the source of truth for desktop colours, font and shape. Edit it, then run:

```sh
system-theme-apply.py --reload
```

The script lives in `scripts/system/` and is on `PATH` as `~/.scripts/system/system-theme-apply.py`. Use `--check` to see a diff of what would change without writing anything. It exits 1 when an output is out of date.

## Colour roles

- `background` is the base of the desktop, Mako notifications and the Walker hint strip.
- `surface` fills raised panels such as the Walker box and search field.
- `rule` is for separators and borders. Hyprland window borders use it on purpose instead of the accent. Inactive windows get the same colour at 50% alpha.
- `foreground` is body text.
- `muted` is secondary text.
- `accent` marks selection and current state only, like the selected Walker entry or the Mako progress bar. Do not use it for decoration.
- `alert`, `warning` and `good` are status colours. Critical Mako notifications get an `alert` border.

`font`, `shape.radius` and `terminal.ghosttyTheme` feed the Mako font and corner radius and the Ghostty theme. Quickshell reads `palette.json` directly and updates live, so it needs no generated file.

## Generated files

`system-theme-apply.py` rewrites these files completely. Do not edit them by hand.

- `leo/theme/hyprland.conf` contains the theme settings sourced by Hyprland.
- `leo/theme/hyprlock.conf` contains theme variables only. Native layout and authentication stay in `hypr/hyprlock.conf`.
- `leo/login/theme.conf.user` contains the full SDDM `[General]` theme configuration. The QML theme lives in `leo/login/Main.qml`, with defaults in `theme.conf` and registration in `metadata.desktop`.

These files have a generated block between `leo-theme:begin` and `leo-theme:end` markers. The script only replaces the block and removes duplicates of the settings it owns. Everything else in the file is yours.

- `walker/themes/leo/style.css` holds the `@define-color` lines.
- `mako/config` holds the colours, font, border radius and the `[urgency=critical]` section. All global options must precede criteria sections. Other criteria, such as Do not disturb, can follow the generated block.
- `ghostty/config` holds the `theme =` line.

## Reloading

`--reload` runs `makoctl reload`. Hyprland reloads on its own. Hyprlock reads the theme on the next lock.

SDDM uses a system-wide copy. After changing the palette or `leo/wallpaper/current.jpg`, re-run `scripts/system/system-login-install.sh` as the desktop user, without prefixed `sudo`. It validates inputs before requesting privilege and never restarts SDDM or logs you out. The safest activation point is the next reboot because the running daemon may cache configuration. See [login and lock](../../../../docs/login-lock.md) for installation, staging and rollback.

Open Ghostty windows need ctrl+shift+, and Walker needs a restart:

```sh
pkill -x walker; uwsm-app -- walker --gapplication-service & disown
```
