# Omarchy UI on an existing Arch installation

## Verdict

A user can take Omarchy's Hyprland configuration, themes, and theme commands without running its installer. That is a self-managed integration, not a supported "Omarchy UI only" install. The checked-out entry point unconditionally runs preflight, package, configuration, login, and post-install stages. It has no UI-only mode or package selection ([`install.sh`: 1-18](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install.sh#L1-L18)).

Do not run `boot.sh` or `install.sh` on a valued existing system. `boot.sh` replaces the system mirror list, upgrades packages, removes `~/.local/share/omarchy`, clones a new copy, then sources the full installer ([`boot.sh`: 23-48](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/boot.sh#L23-L48)).

Scope: local clone `f4378f0de5b44d331ee943746a97872b718a6c18`, `Omarchy 3.8.5`.

## Supported and unsupported paths

The installer expects x86_64 vanilla Arch, Secure Boot off, Limine, a Btrfs root, and no installed GNOME Shell or Plasma desktop ([`install/preflight/guard.sh`: 1-46](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/preflight/guard.sh#L1-L46)). A failed guard can be confirmed past, but its text says to proceed "without assistance." It is not a conversion path.

Useful standalone runtime commands do exist:

- `omarchy-theme-list`, `omarchy-theme-set`, `omarchy-theme-install`, and `omarchy-theme-update` manage themes ([`bin/omarchy-theme-set`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-set), [`bin/omarchy-theme-install`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-install), [`bin/omarchy-theme-update`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-update)).
- `omarchy-refresh-config <path>` replaces one shipped config after making a timestamped backup and printing a diff. It does not merge ([`bin/omarchy-refresh-config`: 5-44](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-refresh-config#L5-L44)).

They assume a pre-existing Omarchy runtime tree, `OMARCHY_PATH`, `~/.config/omarchy`, the `omarchy-*` helpers, and supporting desktop services. They are reusable components, not a supported bootstrap.

## Why the full installer is risky

- Online installation overwrites `/etc/pacman.conf` and the mirrorlist, imports and locally signs an Omarchy key, installs `omarchy-keyring`, then runs `pacman -Syyuu` ([`install/preflight/pacman.sh`: 1-17](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/preflight/pacman.sh#L1-L17)). Its pacman config adds `[omarchy]` with `SigLevel = Optional TrustAll` ([`default/pacman/pacman-stable.conf`: 1-25](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/default/pacman/pacman-stable.conf#L1-L25)).
- It installs every un-commented package in the base manifest, rather than a desktop subset ([`install/packaging/base.sh`: 1-3](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/packaging/base.sh#L1-L3), [`install/omarchy-base.packages`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/omarchy-base.packages)).
- It recursively copies `config/*` over `~/.config` and overwrites `~/.bashrc`, with no backup or merge ([`install/config/config.sh`: 1-6](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/config/config.sh#L1-L6)). The same stage runs Docker, MIME, systemd, udev, power, network, hardware, GPG, and Pi setup ([`install/config/all.sh`: 1-73](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/config/all.sh#L1-L73)).
- It rewrites boot and login configuration. The Limine stage writes mkinitcpio files, replaces Limine config, configures Snapper, and removes a firmware boot entry ([`install/login/limine-snapper.sh`: 1-103](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/login/limine-snapper.sh#L1-L103)). The SDDM stage installs a session and theme, edits PAM, configures autologin, and enables SDDM ([`install/login/sddm.sh`: 1-37](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/login/sddm.sh#L1-L37)).
- First run enables UFW with Omarchy rules and changes GTK/icon settings ([`install/first-run/firewall.sh`: 1-19](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/first-run/firewall.sh#L1-L19), [`install/first-run/gnome-theme.sh`: 1-4](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/first-run/gnome-theme.sh#L1-L4)).

## UI files and dependencies

| Part | Omarchy packages | Coupling |
| --- | --- | --- |
| session | `hyprland`, `uwsm`, `xdg-desktop-portal-hyprland`, `xdg-desktop-portal-gtk` | The shipped session starts Hyprland through UWSM ([`default/wayland-sessions/omarchy.desktop`: 1-6](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/default/wayland-sessions/omarchy.desktop#L1-L6)). |
| visible shell | `waybar`, `swaybg`, `mako`, `swayosd` | Default autostart launches Waybar, Mako, and Swaybg ([`default/hypr/autostart.conf`: 1-16](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/default/hypr/autostart.conf#L1-L16)). |
| lock and idle | `hypridle`, `hyprlock`, `hyprsunset` | The supplied idle config calls Omarchy lock/wake helpers. Edit it if those helpers are not adopted ([`config/hypr/hypridle.conf`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/config/hypr/hypridle.conf)). |
| launcher and menu | `omarchy-walker` | Optional. Its config points at Omarchy-provided themes, and the menu calls many `omarchy-*` helpers ([`config/walker/config.toml`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/config/walker/config.toml), [`bin/omarchy-menu`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-menu)). |
| fonts and terminal | `ttf-jetbrains-mono-nerd`, `woff2-font-awesome`, plus `alacritty` or `foot` | Waybar and terminal configs name or import generated theme files ([`config/waybar/style.css`: 1-7](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/config/waybar/style.css#L1-L7), [`config/alacritty/alacritty.toml`: 1-20](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/config/alacritty/alacritty.toml#L1-L20)). |

The package manifest also names `fcitx5`, `polkit-gnome`, `gum`, and `jq` for expected input, authentication, menu, and helper behavior ([`install/omarchy-base.packages`: 36, 49, 66, 102](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/install/omarchy-base.packages)). `omarchy-walker` may require Omarchy's repository. Do not replace the existing pacman configuration merely to get it. Use a standard Walker setup or review the repository trust policy separately.

The provided Hyprland entry config hard-codes nine includes under `~/.local/share/omarchy/default`, then sources the generated current theme and local overrides ([`config/hypr/hyprland.conf`: 4-23](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/config/hypr/hyprland.conf#L4-L23)). Waybar invokes Omarchy commands for its menu, update status, weather, indicators, and actions ([`config/waybar/config.jsonc`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/config/waybar/config.jsonc)). Copying only these top-level files will leave broken includes and buttons.

## Selective adoption

This is an inferred route, not an upstream procedure.

1. Work in a test user or back up the target user's Hyprland, Waybar, terminal, and GTK files. Never source `install/` scripts.
2. Put a pinned clone at `~/.local/share/omarchy`, or symlink a pinned clone there. Add its `bin` directory to the graphical session PATH. Omarchy's UWSM environment uses:

   ```bash
   export OMARCHY_PATH="$HOME/.local/share/omarchy"
   export PATH="$OMARCHY_PATH/bin:$PATH:$HOME/.local/bin"
   ```

   ([`config/uwsm/env`: 1-10](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/config/uwsm/env#L1-L10)).
3. Install only the needed packages from the existing repositories. Start with the session, visible-shell, and font rows. Add Walker, lock/idle, Fcitx, and the menu helpers only when needed.
4. Diff and copy individual files from `config/`. Remove unwanted `omarchy-*` bindings and autostarts. In particular, omit `omarchy-first-run`, power-profile setup, monitor watch, and post-boot hooks from the default autostart unless their dependencies are intentionally adopted.
5. After creating `~/.config/omarchy`, test the narrow commands first:

   ```bash
   omarchy-theme-list
   omarchy-theme-set "Tokyo Night"
   omarchy-refresh-config waybar/style.css
   ```

   Theme selection copies a theme into `current`, generates template outputs, swaps it atomically, sets a background, restarts components, and calls application-specific setters ([`bin/omarchy-theme-set`: 8-73](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-set#L8-L73)). The generator turns `colors.toml` into Hyprland, Waybar, Mako, terminal, and OSD files from `default/themed/*.tpl` ([`bin/omarchy-theme-set-templates`: 5-49](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-set-templates#L5-L49)).

`omarchy-theme-set` is not purely visual. It changes GNOME settings, may write browser policy files, edits VS Code settings and extensions, writes Obsidian themes, and controls supported keyboard LEDs ([`bin/omarchy-theme-set-gnome`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-set-gnome), [`bin/omarchy-theme-set-browser`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-set-browser), [`bin/omarchy-theme-set-vscode`](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-set-vscode)). To preserve preferred app configuration, inspect or bypass those setters and copy only the generated files wanted.

Avoid broad resets such as `omarchy-refresh-hyprland`, which replaces all shipped Hyprland user files ([`bin/omarchy-refresh-hyprland`: 1-9](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-refresh-hyprland#L1-L9)).

## Upgrades

For a partial setup, do not run `omarchy update` or `omarchy reinstall`. `omarchy update` pulls the Git tree, performs a full pacman update, runs every pending migration, updates AUR and orphan packages, and restarts components ([`bin/omarchy-update`: 8-23](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-update#L8-L23), [`bin/omarchy-migrate`: 8-28](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-migrate#L8-L28)). `omarchy reinstall` says it reinstalls default packages and loses user config changes ([`bin/omarchy-reinstall`: 8-18](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-reinstall#L8-L18)).

Pin and review the clone. Update Arch through the existing process, inspect upstream changes to `themes/`, `default/themed/`, and copied config, then selectively regenerate or refresh. `omarchy-theme-update` is narrower: it only runs `git pull` in Git repositories under `~/.config/omarchy/themes` ([`bin/omarchy-theme-update`: 1-9](https://github.com/basecamp/omarchy/blob/f4378f0de5b44d331ee943746a97872b718a6c18/bin/omarchy-theme-update#L1-L9)).
