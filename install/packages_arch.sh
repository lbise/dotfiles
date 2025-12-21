#!/usr/bin/env bash
set -Eeuo pipefail

PACMAN_PKGS="zsh tmux git unzip swaybg mako hypridle hyprlock man-db man-pages waybar impala"
YAY_PKGS="neovim ghostty zen-browser-bin fzf ripgrep xdg-terminal-exec elephant walker"

# Only install packages if needed
sudo pacman -S --noconfirm --needed $PACMAN_PKGS
yay -S  --noconfirm --needed $YAY_PKGS

# Start elephant
elephant service enable
systemctl --user start elephant.service
