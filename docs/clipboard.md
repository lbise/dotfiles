# Clipboard

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Super+C | Copy the selection |
| Super+V | Paste the system clipboard |
| Super+X | Send Ctrl+X, cut in GUI apps |
| Super+Ctrl+V | Search clipboard history |

In history, Enter copies the selected entry. Press Super+V after the picker closes to paste it. Opening Walker and typing `$` also searches history. History selection does not auto-paste.

Super+C/V use Ctrl+C/V in GUI applications. In Ghostty they use Ctrl+Insert and Shift+Insert, which Ghostty maps to its clipboard actions. This avoids sending Ctrl+C to the shell. Other terminal emulators need explicit support in `scripts/system/system-clipboard.sh` before using these shortcuts safely.

Super+X retains the shell's Ctrl+X behavior in a terminal; it does not cut terminal selections. In tmux copy mode or a Neovim visual selection, use the application's yank command. Super+C copies Ghostty's own screen selection, not those selections.

## Components

- `dot/.config/hypr/hyprland.conf` defines the shortcuts.
- `scripts/system/system-clipboard.sh` selects the copy/paste chord for the active window.
- Walker provides the history picker; Elephant's clipboard provider records text and images through `wl-clipboard`.
- The Arch installer installs the provider and enables `elephant.service`. Hyprland starts Walker. No Omarchy installation is needed.

Elephant's defaults retain 100 entries in its on-disk cache, with no age-based expiry. Text marked with the supported password-manager hint is excluded, but unmarked secrets can enter history. See [the source investigation](research/omarchy-clipboard.md) for retention and sensitive-data details.

## Neovim

`dot/.config/nvim/lua/core/clipboard.lua` picks the provider:

| Session | Copy | `p` from the system clipboard |
| --- | --- | --- |
| tmux | tmux provider (tmux emits OSC 52) | tmux provider |
| Local Arch desktop | `wl-copy` (Neovim's detection) | `wl-paste` |
| Local WSL | `win32yank.exe`, else `clip.exe` | `win32yank.exe`, else PowerShell `Get-Clipboard` |
| SSH | OSC 52 | OSC 52 read if the terminal allows it |

Over SSH, Ghostty answers OSC 52 reads (`clipboard-read = allow`). Windows Terminal does not, so `p` pastes the last Neovim yank; paste from Windows with Ctrl+Shift+V instead. Neovim asks the terminal once per session and waits up to 1 s before falling back.

In WSL, `install/apps/win32yank.sh` installs `win32yank.exe` to `~/.local/bin`. Without it, Neovim falls back to `clip.exe` and PowerShell, which is slow and can mangle non-ASCII text.

Run `nvim --clean --headless -l scripts/tests/test-nvim-clipboard.lua` from the repository root to check provider selection.

## Checks

Run the helper's isolated regression tests without touching the desktop clipboard:

```bash
python3 -m unittest discover -s scripts/tests -p 'test_system_clipboard.py'
bash -n scripts/system/system-clipboard.sh install/packages_arch.sh
hyprctl configerrors
```

Then check the desktop behavior manually with non-sensitive text:

1. Copy from a GUI app with Super+C and paste into Ghostty with Super+V.
2. Select text in Ghostty, copy with Super+C, and paste into a GUI app.
3. Yank from tmux copy mode and Neovim, then paste into a GUI app.
4. Open Super+Ctrl+V, search for the test text, select it with Enter, and paste with Super+V.
5. Take a screenshot, select its history entry, and paste into an image-capable app.
6. Cancel the history picker with Escape and confirm the clipboard is unchanged.

If history does not open, check `systemctl --user status elephant.service` and try `walker -m clipboard` from a terminal. Do not add a second `wl-paste` watcher; Elephant owns capture.
