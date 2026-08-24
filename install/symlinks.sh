#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source $SCRIPT_DIR/helpers.sh

DOTFILES_ROOT="$(dirname "$SCRIPT_DIR")"
DOTFILES_DOT_ROOT="$DOTFILES_ROOT/dot"

# Common symlinks for all environments
COMMON_LINKS=(
    ".bashrc"
    ".zshrc"
    ".aliases"
    ".exports"
    ".zsh_work"
    ".gitconfigwork"
    ".tmux.conf"
    ".tmux/plugins"
    ".config/nvim"
    ".config/opencode"
    ".config/herdr/config.toml"
    ".ssh/config"
    ".gnupg/gpg-agent.conf"
    ".config/fcitx5"
    ".config/environment.d"
    ".config/shell/ssh-auth-sock.sh"
    ".pi/agent/prompts"
    # Includes pi-footer.json at ~/.pi/agent/extensions/pi-footer.json.
    ".pi/agent/extensions"
    ".pi/agent/themes"
    ".agents/skills"
)

# Desktop-only symlinks (Hyprland, Waybar, etc.)
DESKTOP_LINKS=(
    ".config/ghostty"
    ".config/hypr"
    ".config/mako"
    ".config/waybar"
    ".config/uwsm"
    ".config/walker"
    ".config/leo"
    ".local/share/applications/connect-rdp.desktop"
)

# Start with common links
DOTFILES_LINKS=("${COMMON_LINKS[@]}")

if [[ "$USER" == "jean-claude-bot" ]]; then
    DOTFILES_LINKS+=(".gitconfigbot:.gitconfig")
else
    DOTFILES_LINKS+=(".gitconfig")
fi

# Add desktop links if not on work machine
if ! is_work; then
    DOTFILES_LINKS+=("${DESKTOP_LINKS[@]}")
fi

DOTFILES_DST="$HOME"

if [[ ! -d "$DOTFILES_DOT_ROOT" ]]; then
    echo "$DOTFILES_DOT_ROOT does not exist"
    exit 1
fi

PI_MACHINE_ROLE="$(pi_machine_role)"
PI_SETTINGS_SOURCE="$DOTFILES_DOT_ROOT/.pi/agent/settings.${PI_MACHINE_ROLE}.json"
if [[ ! -f "$PI_SETTINGS_SOURCE" ]]; then
    echo "Missing Pi settings profile for machine role '$PI_MACHINE_ROLE': $PI_SETTINGS_SOURCE" >&2
    exit 1
fi

echo "Pi machine role: $PI_MACHINE_ROLE"

for REL in "${DOTFILES_LINKS[@]}"; do
    SRC_REL="${REL%%:*}"
    DST_REL="${REL#*:}"
    if [[ "$REL" != *:* ]]; then
        DST_REL="$REL"
    fi

    SRC="$DOTFILES_DOT_ROOT/$SRC_REL"
    DST="$DOTFILES_DST/$DST_REL"
    create_symlink "$SRC" "$DST"
done

# Select the tracked Pi profile for this machine.
create_symlink "$PI_SETTINGS_SOURCE" "$DOTFILES_DST/.pi/agent/settings.json"

# Symlink scripts folder
SCRIPT_DST="$HOME/.scripts"
if [ ! -e "$SCRIPT_DST" ]; then
    rm -rf "$SCRIPT_DST"
    create_symlink "$DOTFILES_ROOT/scripts" "$SCRIPT_DST"
else
    SCRIPT_SRC_REAL=$(cd "$DOTFILES_ROOT/scripts" && pwd -P)
    SCRIPT_DST_REAL=$(cd "$SCRIPT_DST" && pwd -P)
    if [[ "$SCRIPT_DST_REAL" != "$SCRIPT_SRC_REAL" ]]; then
        echo "ERROR: $SCRIPT_DST already exists and does not point to $DOTFILES_ROOT/scripts" >&2
        echo "Move it out of the way and rerun the installer." >&2
        exit 1
    fi
fi
