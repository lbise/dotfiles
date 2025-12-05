#!/usr/bin/env bash
set -Eeuo pipefail
 
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_ROOT="$(dirname "$SCRIPT_DIR")"

if ! command -v stow >/dev/null 2>&1; then
	echo "Stow is not installed. Run $DOTFILES_ROOT/install.sh"
	exit 1
fi

# Symlinks all files to home
stow -d $DOTFILES_ROOT -t $HOME .
