#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_ROOT="$(dirname "$SCRIPT_DIR")/dot"
DOTFILES_LINKS=(
    ".gitconfig"
    ".config/nvim"
)

    #".zshrc"
    #".gitconfig"
    #".tmux.conf"
    #".config/nvim"
    #".config/ghostty"
DOTFILES_DST="$HOME"

if [[ ! -d "$DOTFILES_ROOT" ]]; then
    echo "$DOTFILES_ROOT does not exist"
    exit 1
fi

for REL in "${DOTFILES_LINKS[@]}"; do
    SRC="$DOTFILES_ROOT/$REL"
    DST="$DOTFILES_DST/$REL"
    echo "Symlink: $SRC -> $DST"

    if [[ ! -e "$SRC" ]]; then
        echo "ERROR: $SRC does not exist"
        exit 1
    fi

    if [[ ! -e "$DST" ]]; then
        echo "$DST already exist, removing it"
        rm -rf "$DST"
    fi

    ln -sf "$SRC" "$DST"
done
