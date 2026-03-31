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
    ".ssh/config"
    ".gnupg/gpg-agent.conf"
    ".config/fcitx5"
    ".config/environment.d"
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

# Symlink scripts folder
SCRIPT_DST="$HOME/.scripts"
if [ ! -e "$SCRIPT_DST" ]; then
    rm -rf "$SCRIPT_DST"
    create_symlink "$DOTFILES_ROOT/scripts" "$SCRIPT_DST"
fi
