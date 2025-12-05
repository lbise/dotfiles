#!/usr/bin/env bash
set -Eeuo pipefail

PACMAN_PKGS="zsh tmux git"
YAY_PKGS="neovim ghostty stow zen-browser-bin"

# Only install packages if needed
sudo pacman -S --noconfirm --needed $PACMAN_PKGS
yay -S  --noconfirm --needed $YAY_PKGS
