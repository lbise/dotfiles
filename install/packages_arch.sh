#!/usr/bin/env bash
set -Eeuo pipefail

PACMAN_PKGS="zsh tmux git git-delta tree-sitter-cli unzip swaybg mako hypridle hyprlock man-db man-pages waybar iwd impala fcitx5 fcitx5-configtool fcitx5-gtk brightnessctl jq grim slurp satty"
YAY_PKGS="neovim ghostty zen-browser-bin eza fd fzf ripgrep xdg-terminal-exec elephant-all-bin walker dropbox"

migrate_legacy_tree_sitter_cli() {
    local tree_sitter_bin="${TREE_SITTER_SYSTEM_BIN:-/usr/bin/tree-sitter}"
    local npm_root=""
    local npm_tree_sitter_cli=""
    local tree_sitter_target=""

    [[ -e "$tree_sitter_bin" || -L "$tree_sitter_bin" ]] || return 0
    pacman -Qo "$tree_sitter_bin" >/dev/null 2>&1 && return 0

    npm_root=$(npm root -g 2>/dev/null || true)
    npm_tree_sitter_cli="$npm_root/tree-sitter-cli/cli.js"
    tree_sitter_target=$(readlink -f "$tree_sitter_bin" 2>/dev/null || true)

    if [[ -n "$npm_root" && "$tree_sitter_target" == "$npm_tree_sitter_cli" ]]; then
        echo ">> Replacing the legacy global npm tree-sitter-cli with the Arch package..."
        sudo npm uninstall -g tree-sitter-cli
    fi

    if [[ -e "$tree_sitter_bin" || -L "$tree_sitter_bin" ]]; then
        echo "Cannot install tree-sitter-cli: $tree_sitter_bin exists but is not owned by pacman." >&2
        echo "Identify or remove that file, then rerun install.sh." >&2
        return 1
    fi
}

migrate_legacy_tree_sitter_cli

# Only install packages if needed
sudo pacman -S --noconfirm --needed $PACMAN_PKGS
yay -S  --noconfirm --needed $YAY_PKGS

# Start Wi-Fi at boot instead of waiting for the first client to activate iwd.
sudo systemctl enable --now iwd.service

# Start elephant
elephant service enable
systemctl --user start elephant.service
