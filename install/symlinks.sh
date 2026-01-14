#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source $SCRIPT_DIR/helpers.sh

DOTFILES_ROOT="$(dirname "$SCRIPT_DIR")"
DOTFILES_DOT_ROOT="$DOTFILES_ROOT/dot"

# Common symlinks for all environments
COMMON_LINKS=(
    ".zshrc"
    ".aliases"
    ".exports"
    ".zsh_work"
    ".gitconfig"
    ".gitconfigwork"
    ".tmux.conf"
    ".tmux/plugins"
    ".config/nvim"
    ".config/opencode"
    ".ssh/config"
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
)

# Start with common links
DOTFILES_LINKS=("${COMMON_LINKS[@]}")

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
    SRC="$DOTFILES_DOT_ROOT/$REL"
    DST="$DOTFILES_DST/$REL"
    create_symlink "$SRC" "$DST"
done

# Symlink scripts folder
SCRIPT_DST="$HOME/.scripts"
if [ ! -e "$SCRIPT_DST" ]; then
    create_symlink "$DOTFILES_ROOT/scripts" "$SCRIPT_DST"
fi
