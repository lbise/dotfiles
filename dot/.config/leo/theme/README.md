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

`system-theme-apply.py` rewrites `leo/theme/hyprland.conf` completely. Hyprland sources it, so do not edit it by hand.

These files have a generated block between `leo-theme:begin` and `leo-theme:end` markers. The script only replaces the block and removes duplicates of the settings it owns. Everything else in the file is yours.

- `walker/themes/leo/style.css` holds the `@define-color` lines.
- `mako/config` holds the colours, font, border radius and the `[urgency=critical]` section. Mako needs criteria sections after the global options, so keep the block at the end of the file.
- `ghostty/config` holds the `theme =` line.

## Reloading

`--reload` runs `makoctl reload`. Hyprland reloads on its own. Open Ghostty windows need ctrl+shift+, and Walker needs a restart:

```sh
pkill -x walker; uwsm-app -- walker --gapplication-service & disown
```
