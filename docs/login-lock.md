# Login and lock

SDDM login and native Hyprlock use the same graphite Quickshell palette and the existing user-selected wallpaper at `~/.config/leo/wallpaper/current.jpg`. Neither uses a screenshot of the open session. No newly sourced or generated raster ships with the pair. [DESIGN.md](../DESIGN.md#authentication) records the shared layout.

## Files and authentication

- `dot/.config/leo/theme/palette.json` is the colour, font and shape source.
- `scripts/system/system-theme-apply.py` generates full `leo/theme/hyprlock.conf` theme variables and full `leo/login/theme.conf.user` with `[General]`, alongside its existing targets. Do not hand-edit either output.
- `dot/.config/hypr/hyprlock.conf` owns native layout and authentication. It displays `$USER` and uses native Enter submission. PAM stays enabled; optional fingerprint support stays enabled too, but this machine has no `fprintd` service.
- `dot/.config/leo/login/Main.qml` is the SDDM theme. `theme.conf` supplies defaults and `metadata.desktop` registers it. The editable username starts with SDDM's remembered user. Session selection uses SDDM's remembered-session API, then falls back to Hyprland or the first available session.

Neither screen has a bar or a card. Both place the 120px clock, the date, the account name, the 320×48 password field and one feedback line by box centre relative to the screen centre (−150, −60, +56, +110 and +164px); session or keyboard layout and power controls sit in the bottom corners. [DESIGN.md](../DESIGN.md#authentication) describes the layout. Large type uses Mona Sans, named by `font.display` and `font.text` in palette.json; the corner controls keep JetBrains Mono. The login theme reads `displayFamily`, `textFamily`, `clockSize`, `textSize`, `fieldSize`, `messageSize` and `chipSize`; Hyprlock reads the matching `$lock_*` variables. Hyprlock label sizes are points (pixels × 0.75) and markup sizes Pango units, both generated. Hyprlock parses `font_family` as a Pango description, so the generated Mona Sans names end with a comma; without it Pango reads "SemiExpanded" as a stretch and falls back to another face.

Native power actions use `scripts/system/system-lock-power.py` with a three-second second-click guard for restart and shutdown. `system-lock-power-status.sh` supplies lightweight Bash status labels; `pending --markup ALERT_COLOUR` prints the rose "Click again to restart" (or "to shut down") line Hyprlock shows above its power buttons while an action is armed, and an empty line otherwise. The corner label positions in `hyprlock.conf` come from `pango-view` measurements that centre each glyph on its 36px disc; re-measure them if the glyphs or chip size change. The layout readout maps layouts to short names with `$LAYOUT[ch]`; keep that list in step with `kb_layout` in `hyprland.lua`. SDDM uses a confirmation card that rises from the power buttons, modal but undimmed, with Cancel focused by default. Suspend needs no confirmation; SDDM only shows it when the daemon reports support. These controls do not bypass authentication or change power policy.

## Install and activate

Run from the repository as the desktop user, **without prefixed sudo**. The installer reads that user's configuration, wallpaper and fonts.

```sh
python3 scripts/system/system-theme-apply.py
bash scripts/system/system-login-install.sh --dry-run
bash scripts/system/system-login-install.sh
```

The installer validates before asking for sudo. It copies the theme and wallpaper into `/usr/share/sddm/themes/leo` and these local files from `~/.local/share/fonts/NerdFonts` into `/usr/local/share/fonts/leo`:

- `JetBrainsMonoNerdFont-Regular.ttf` (corner controls)
- `JetBrainsMonoNerdFontPropo-Regular.ttf` (glyphs)
- `JetBrainsMonoNerdFont-Medium.ttf`, `-SemiBold.ttf`, `-Bold.ttf` (no longer used; kept so older backups roll back)
- `MonaSansDisplaySemiExpanded-Light.ttf` (clock)
- `MonaSansSemiExpanded-Regular.ttf` (date, field)
- `MonaSansSemiExpanded-Medium.ttf` (account name)

The Mona Sans files (v2.0.27 static release, SIL OFL, licence in `fonts/MonaSans-OFL.txt`) live in the repository's `fonts/` directory; `install/fonts.sh` copies them into `~/.local/share/fonts/NerdFonts` with the Nerd Fonts.

If a local font is absent, an existing world-readable system copy can satisfy validation. Theme and font assets are root-readable and readable by the greeter, without depending on a private home path.

`/etc/sddm.conf` takes precedence over drop-ins. The installer writes `/etc/sddm.conf.d/99-leo-theme.conf` and patches the main file when needed, changing only these three keys:

```ini
[Theme]
Current=leo
[General]
InputMethod=
GreeterEnvironment=QT_IM_MODULE=
```

It backs up changed files under `/var/lib/leo-login-install/backups` and preserves unrelated configuration, authentication, autologin and session settings. It never modifies PAM, accounts or session definitions, restarts SDDM, or logs the user out.

The safest activation point is the next reboot. A running SDDM daemon may cache configuration, so logging out is not a guaranteed activation step. Hyprlock picks up its theme on the next lock. After changing the palette or wallpaper, regenerate the theme and re-run the installer.

## Stage and roll back

`--dry-run` validates without writes or sudo. `--stage DIR` writes a complete fake-root install, including assets, configuration and backups, without sudo or daemon actions:

```sh
bash scripts/system/system-login-install.sh --stage /tmp/leo-login-stage
```

Use the actual backup ID printed by the installer. `BACKUP_ID` below is a placeholder, not a real backup:

```sh
bash scripts/system/system-login-install.sh --rollback BACKUP_ID
bash scripts/system/system-login-install.sh --stage /tmp/leo-login-stage --rollback BACKUP_ID --dry-run
bash scripts/system/system-login-install.sh --stage /tmp/leo-login-stage --rollback BACKUP_ID
```

Live rollback requests sudo and refuses to overwrite subsequent edits. It restores changed files, removes newly installed files and retains backups. Live `--rollback BACKUP_ID --dry-run` is explicitly unsupported because live manifests are root-only; rollback dry-runs require `--stage`.

## Checks and limits

Run from the repository root:

```sh
python3 -m unittest discover -s scripts/tests -p 'test_system_theme_apply.py'
python3 -m unittest discover -s scripts/tests -p 'test_lock_power.py'
bash scripts/tests/test-system-login-install.sh
bash scripts/tests/test-login-theme.sh
```

Optional QML captures use the existing wallpaper, not a new asset:

```sh
bash scripts/tests/test-login-theme.sh \
  --wallpaper "$HOME/.config/leo/wallpaper/current.jpg" \
  --capture-dir .scratch/login-preview/qml
```

The QML suite needs Qt 6 `qmltestrunner`, Python 3 and `timeout`. Authentication and power APIs are mocks with synthetic users. Captures covered native Hyprlock at 1280×800, 1920×1080 and 2560×1440, and QML login, typing, error, confirmation and session-list states at 800×600, 1280×720, 1920×1080 and 2560×1440. Top-right warnings in native previews belong to the isolated preview compositor, not Hyprlock.

Screenshots and logs live under `.scratch/login-preview` and need not be committed. The latest captures are in `pass4/`.

Independent review returned **ship at the reviewed scope** after verifying the contrast, matching blur, power-confirmation status reader, rollback limitations and password-submission assertion. The checks passed: 14 theme tests, 6 confirmation/status-reader tests, the staged installer suite and 18 QML checks including captures. A second visual pass later moved system controls into bar groups and aligned the two cards on one row grid; after it, 14 theme tests, 7 confirmation/status-reader tests, the staged installer suite and 18 QML checks passed, with fresh captures in `review-lock-*.png` and `pass2/`. A third pass moved the date and system controls on both screens into a copy of the Quickshell bar and corrected Hyprlock's card and field, which had rendered 2px too large; 14 theme tests, 7 confirmation/status-reader tests, the staged installer suite and 19 QML checks passed, with login captures (including the session list) and native lock captures (`lock-{1280,1920,2560}.png`, plus `lock-1920-armed.png`) in `pass3/`. A fourth pass removed the bar and card from both screens, cut the instruction text, moved the controls to the bottom corners and set the large type in Mona Sans; 15 theme tests, the confirmation/status-reader tests, the staged installer suite and 20 QML checks passed, with native lock captures (`lock-{1280,1920,2560}.png`) and login captures (login, typing, error, confirmation and session list at four sizes, in `login/`) in `pass4/`. Real PAM authentication, fingerprint recognition, session startup and privileged installation remain untested.
