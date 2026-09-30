# Launcher menus

Super+R opens walker with apps only. Super+Space opens the main menu, and Super+Escape
opens the power menu directly. Escape goes back one level; in the main menu (or the
power menu) it closes. The menus are elephant `menus` providers, defined as data
in `dot/.config/elephant/menus/` (linked to `~/.config/elephant/menus`). Walker only
renders them; see `hyprland.conf` for the `$menu` flags that make them fit their entries.

```
leo (Super+Space)
├── Install    → install   Package, AUR, Docker
├── Remove                 fzf of installed packages
├── Update     → update    System packages, Firmware, Restart → restart
├── Capture    → capture   Screenshot region/screen, Text (OCR), Color
├── Style      → style     Background → wallpaper, Edit/Apply palette
├── Setup      → setup     Wi-Fi, Bluetooth, Audio, Printer, Timezone, Config → config
├── Learn      → learn     Keybindings → keybindings, doc links
└── System     → system    Lock, Suspend, Restart, Shutdown
```

`power.toml` repeats the System entries without a parent, for Super+Escape, so Escape
there closes instead of landing on the main menu. Keep it in sync with `system.toml`.

`keybindings.lua` and `wallpaper.lua` are Lua menus: their rows are built on each open
(from `hyprctl binds -j` and from `~/.config/leo/wallpaper`).

## Back navigation

Every submenu declares `parent` (`Parent` in Lua files) naming the menu it is opened from.
Walker's built-in `menus:parent` action, bound to Escape, uses it. A new submenu needs
both an entry that opens it (`submenu = "name"`) and its own `parent`, or Escape will
close the launcher instead of going back.

## Adding an entry

Add an `[[entries]]` block to the right `.toml` file and restart elephant
(`systemctl --user restart elephant`). Actions run through `sh -c`, so `&&`, `$()` and
`~` work. Rules learned the hard way:

- **Icons:** name the `-symbolic` variant (`view-refresh-symbolic`). Adwaita also ships
  full-color icons under the plain name, and those clash with the rest of the menu.
  Check the file exists in `/usr/share/icons/Adwaita/symbolic/`.
- **Terminal UIs:** run them with `system-exec-float.sh <title> <command>`. It opens a
  floating window (`org.leo.menu` window rule in `hyprland.conf`) so it never tiles.
- **Screen tools** (slurp, screenshots): prefix the action with `sleep 0.3 &&` so the
  launcher is gone first.
- **Restarting elephant from an action** must go through `systemd-run --user`, or the
  restart kills the action that started it.
- `subtext` is hidden by the walker theme (`.item-subtext` is zero-sized), so it is only
  documentation for whoever reads the TOML.

## Checking a menu without disturbing the desktop

- `elephant query "menus:setup;;100;false"` prints a menu's entries and icons.
- `scripts/tests/render-walker-menus.sh OUTDIR leo setup` screenshots real menus on a
  virtual output. It does not touch your focus or workspaces.
- `scripts/tests/test-system-menu-tools.sh` and `test-system-pkg-install.sh` cover the
  scripts behind the entries with stubbed pacman, yay, fzf and friends.

## Tools the menus expect

`tesseract`, `tesseract-data-eng` and `hyprpicker` (Capture) are in
`install/packages_arch.sh`. OCR languages come from `$LEO_OCR_LANGS` (default `eng`).
