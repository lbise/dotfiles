#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source $SCRIPT_DIR/helpers.sh

DOTFILES_ROOT="$(dirname "$SCRIPT_DIR")"
DOTFILES_DOT_ROOT="$DOTFILES_ROOT/dot"
DOTFILES_LINKS=(
    ".zshrc"
    ".aliases"
    ".exports"
    ".zsh_work"
    ".gitconfig"
    ".tmux.conf"
    ".config/nvim"
    ".config/ghostty"
    ".config/hypr"
)

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
create_symlink "$DOTFILES_ROOT/scripts" "$DOTFILES_DST/.scripts"
