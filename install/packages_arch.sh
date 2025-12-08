#!/usr/bin/env bash
set -Eeuo pipefail

PACMAN_PKGS="zsh tmux git unzip swaybg mako hypridle hyprlock"
YAY_PKGS="neovim ghostty zen-browser-bin fzf ripgrep"

# Only install packages if needed
sudo pacman -S --noconfirm --needed $PACMAN_PKGS
yay -S  --noconfirm --needed $YAY_PKGS
