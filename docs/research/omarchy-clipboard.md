# Adopting Omarchy's unified clipboard

## Recommendation

Keep this repo's Walker and Elephant setup. Fix the history launcher, then add app-aware copy/paste dispatch if GUI compatibility is needed. Porting Omarchy's current history UI would also require its Quickshell infrastructure.

The investigation below records the setup before implementation. The subsequent changes keep Walker/Elephant, replace the missing history launcher, and add a Ghostty-aware copy/paste helper. History remains copy-only with the default 100-entry limit. See [clipboard usage and checks](../clipboard.md).

## How the current Omarchy checkout works

Inspected checkout `b5589faaf80c6f87c07d4560fca37c4a81722f28`. This differs from the older checkout described in `omarchy-on-existing-arch.md`.

- Super+C and Super+V send Ctrl+C/V to GUI applications, but Ctrl+Insert and Shift+Insert to tagged terminals. Super+X sends Ctrl+X even in terminals, where it is not a general-purpose cut command. The implementation splits synthetic key-down and key-up with a 50 ms delay. [Clipboard bindings](https://github.com/basecamp/omarchy/blob/b5589faaf80c6f87c07d4560fca37c4a81722f28/default/hypr/bindings/clipboard.lua#L1-L48), [terminal tags](https://github.com/basecamp/omarchy/blob/b5589faaf80c6f87c07d4560fca37c4a81722f28/default/hypr/apps/terminals.lua#L1-L9)
- Ghostty maps the Insert chords to its system clipboard. Tmux enables OSC 52 clipboard integration. These connect terminal copies to the desktop clipboard rather than creating another history store. [Ghostty](https://github.com/basecamp/omarchy/blob/b5589faaf80c6f87c07d4560fca37c4a81722f28/config/ghostty/config#L25-L27), [tmux](https://github.com/basecamp/omarchy/blob/b5589faaf80c6f87c07d4560fca37c4a81722f28/config/tmux/tmux.conf#L70-L81)
- Super+Ctrl+V opens a Quickshell overlay, not Walker. Its always-loaded plugin runs text and PNG `wl-paste --watch` processes, retains up to 500 entries, and stores history under `~/.local/state/omarchy/`. Enter copies and pastes the selected item; Shift+Enter only copies. [Plugin manifest](https://github.com/basecamp/omarchy/blob/b5589faaf80c6f87c07d4560fca37c4a81722f28/shell/plugins/clipboard/manifest.json), [history UI and watchers](https://github.com/basecamp/omarchy/blob/b5589faaf80c6f87c07d4560fca37c4a81722f28/shell/plugins/clipboard/Clipboard.qml#L20-L281)
- The capture helper skips sensitive clipboard state and the KDE password-manager hint. That cannot protect secrets copied without a sensitivity marker. [Capture helper](https://github.com/basecamp/omarchy/blob/b5589faaf80c6f87c07d4560fca37c4a81722f28/shell/plugins/clipboard/capture.sh#L1-L93)

## What this repo had at investigation time

- [Hyprland](../../dot/.config/hypr/hyprland.conf) already binds Super+C/V/X, but sends the Insert copy/paste chords to every application. Its history shortcut still invokes `omarchy-launch-walker -m clipboard`.
- [Ghostty](../../dot/.config/ghostty/config) already maps both Insert chords and permits clipboard reads/writes. [Tmux](../../dot/.tmux.conf) enables OSC 52. [Neovim](../../dot/.config/nvim/lua/core/config.lua) sets `unnamedplus`, with a [tmux provider override](../../dot/.config/nvim/lua/core/tmux.lua) inside tmux. Preserve that SSH-aware setup. Neovim visual selections and tmux copy-mode selections still use their own yank commands, not Ghostty's screen-selection copy command.
- [Walker](../../dot/.config/walker/config.toml) already exposes clipboard history through the `$` prefix. [The Arch installer](../../install/packages_arch.sh) installs `elephant-all-bin` and Walker, then enables and starts Elephant.
- Read-only checks on this machine found Walker 2.17.0, Elephant clipboard 2.22.0, and wl-clipboard 2.3.0 installed. `elephant.service` was enabled and running with a `wl-paste --watch` child. `omarchy-launch-walker` was absent from PATH. These checks establish that the backend is running, not that every copy/paste path works end to end.

## Original proposal

1. Replace the missing launcher in `dot/.config/hypr/hyprland.conf`:

   ```ini
   bindd = SUPER CTRL, V, Clipboard manager, exec, walker -m clipboard
   ```

   This opens history with no Omarchy dependency. With the installed defaults, select an entry, press Enter, then Super+V to paste.
2. For closer shortcut parity, add a small local dispatcher that distinguishes Ghostty from GUI apps and sends the appropriate chords through the installed Hyprland API. Do not copy Omarchy's Lua bindings directly into this repo's `.conf` setup.
3. Decide whether history selection should auto-paste. Omarchy does; Elephant's default only copies. Auto-paste would need a helper that waits for Walker to release keyboard focus before injecting paste. Keeping selection and paste separate is simpler and avoids accidentally pasting into a shell.
4. Optionally track `dot/.config/elephant/clipboard.toml` and add it to desktop symlinks to make retention explicit. Elephant defaults to 100 entries, Omarchy to 500. `wl-clipboard` is already a packaged provider dependency; declaring it directly in `install/packages_arch.sh` would also document this repo's screenshot and Neovim usage.

Before treating this as complete, manually check GUI-to-terminal paste, terminal/tmux/Neovim yanks into a GUI app, text and screenshot history, and canceling the history picker without altering the clipboard. No such interactive tests were run during this investigation.

## Elephant backend

Scope. Local packages report Elephant 2.22.0, `elephant-clipboard-bin` 2.22.0, Walker 2.17.0, and wl-clipboard 2.3.0. The Elephant findings below were checked against the `v2.22.0` tag target, commit [`8e77c59`](https://github.com/abenz1267/elephant/tree/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389), and Walker against [`v2.17.0`](https://github.com/abenz1267/walker/tree/42b3ed88abf50bc52638fb2835b7f17e3ea3ac4c).

- The provider documents `wl-clipboard` and ImageMagick as requirements. At startup it disables itself unless `wl-paste` and ImageMagick's `identify` are on `PATH`; the packaged provider declares both as dependencies. It watches changes with `wl-paste --watch`, then reads a text or image offer with `wl-paste -t text -n` or `wl-paste -t image -n`. [Provider README](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/README.md#L1-L15), [availability check](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/setup.go#L103-L119), [watch and reads](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/clipboard.go#L25-L87)

- History is Gob-encoded in `$XDG_CACHE_HOME/elephant/clipboard.gob`, created with mode `0600`. Image files go under `$XDG_CACHE_HOME/elephant/clipboardimages`. The default limit is 100 items. On save, an over-limit history loses its oldest item. There is no default time expiry because `auto_cleanup = 0`; setting it deletes entries at that age in minutes. Pins keep items out of the `remove_all` action, but do not exempt them from age cleanup or the oldest-item limit. [Cache path](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/pkg/common/files.go#L57-L62), [defaults](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/setup.go#L82-L101), [save, trim, and image path](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/setup.go#L188-L274), [cleanup](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/setup.go#L122-L145)

- The text path lists offered MIME types and ignores an offer containing `x-kde-passwordManagerHint`. wl-clipboard 2.3.0 offers exactly that MIME type for `wl-copy --sensitive`, so text copied that way is not added to Elephant history. This is a narrow check. The image path does not test the hint, so a sensitive image offer can still be stored. [Elephant MIME check](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/clipboard.go#L25-L212), [ignored MIME list](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/types.go#L67), [wl-copy's sensitive offer](https://github.com/bugaevc/wl-clipboard/blob/67a7b937895bceec1ae5ccebb10216f63f70ca1b/src/wl-copy.c#L300-L320), [wl-clipboard documentation](https://github.com/bugaevc/wl-clipboard/blob/67a7b937895bceec1ae5ccebb10216f63f70ca1b/data/wl-clipboard.1#L99-L102)

- An empty activation action becomes `copy`. The default `command` is `wl-copy`, and the selected text, URI list, or image is sent to that command's standard input. There is no `paste` or `auto_paste` provider option, and the provider does not inject keystrokes. [Default and options](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/types.go#L47-L67), [activation](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/clipboard.go#L326-L541)

- Clipboard-specific keys are `max_items`, `ocr`, `image_editor_cmd`, `text_editor_cmd`, `command`, `ignore_symbols`, `pinned_on_top`, and `auto_cleanup`. Their defaults are 100, false, empty, empty, `wl-copy`, true, false, and 0. `command` is the copy command, not a paste command. The `wl-paste` watcher and its read options are hard-coded. [Config definition](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/types.go#L47-L65), [hard-coded `wl-paste` calls](https://github.com/abenz1267/elephant/blob/8e77c59ca5b7fd28c0a168535f1a1c000e6b5389/internal/providers/clipboard/clipboard.go#L25-L87)

- Use `walker -m clipboard`, equivalently `walker --provider clipboard`, to query only Elephant's clipboard provider. Walker's stock configuration also maps `:` to that provider. Its stock clipboard actions bind Return to the default `copy` action, not an auto-paste action. [CLI option and handling](https://github.com/abenz1267/walker/blob/42b3ed88abf50bc52638fb2835b7f17e3ea3ac4c/src/main.rs#L250-L261), [exclusive query construction](https://github.com/abenz1267/walker/blob/42b3ed88abf50bc52638fb2835b7f17e3ea3ac4c/src/data.rs#L516-L586), [default prefix and actions](https://github.com/abenz1267/walker/blob/42b3ed88abf50bc52638fb2835b7f17e3ea3ac4c/resources/config.toml#L101-L110), [clipboard action map](https://github.com/abenz1267/walker/blob/42b3ed88abf50bc52638fb2835b7f17e3ea3ac4c/resources/config.toml#L241-L254)

Uncertainties. I did not inspect clipboard data, user configuration values, or service state. The retention and action statements are upstream defaults, not claims about any local override. Sensitive text suppression depends on the exact KDE hint MIME type; the code does not handle every possible sensitive-data convention, and it does not apply that check to images.
