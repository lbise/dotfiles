#!/usr/bin/env bash
#
# Bootstrap script for a brand new Arch Linux installation
# This script installs the minimal packages needed to clone and run install.sh
#
# Usage on a new Arch Linux machine:
#   curl -fsSL https://raw.githubusercontent.com/lbise/dotfiles/main/bootstrap.sh | bash
#
# Or if you prefer to review the script first:
#   curl -fsSL https://raw.githubusercontent.com/lbise/dotfiles/main/bootstrap.sh -o bootstrap.sh
#   chmod +x bootstrap.sh
#   ./bootstrap.sh

set -Eeuo pipefail

echo "********************************************************************************"
echo "Bootstrapping Leo's dotfiles on Arch Linux"
echo "********************************************************************************"

# Check if running on Arch Linux
if [[ ! -f /etc/os-release ]] || ! grep -qi '^ID=arch' /etc/os-release; then
    echo "ERROR: This bootstrap script is only for Arch Linux"
    exit 1
fi

# Update system package database
echo ">> Updating package database..."
sudo pacman -Sy

# Install essential packages needed for the full installation
echo ">> Installing essential packages..."
sudo pacman -S --noconfirm --needed git base-devel

# Check if yay is already installed
if ! command -v yay &> /dev/null; then
    echo ">> Installing yay (AUR helper)..."

    # Create temporary directory for building yay
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"

    # Clone and build yay
    git clone https://aur.archlinux.org/yay.git
    cd yay
    makepkg -si --noconfirm

    # Clean up
    cd ~
    rm -rf "$TEMP_DIR"

    echo ">> yay installed successfully"
else
    echo ">> yay is already installed"
fi

# Clone dotfiles repository
DOTFILES_DIR="$HOME/gitrepo/dotfiles"
if [[ -d "$DOTFILES_DIR" ]]; then
    echo ">> Dotfiles directory already exists at $DOTFILES_DIR"
    read -p "Do you want to remove it and re-clone? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$DOTFILES_DIR"
    else
        echo "Aborting..."
        exit 1
    fi
else
    mkdir -p $DOTFILES_DIR
fi

echo ">> Cloning dotfiles repository..."
# Need SSH keys to clone using ssh
# git clone git@github.com:lbise/dotfiles.git "$DOTFILES_DIR"
git clone https://github.com/lbise/dotfiles.git "$DOTFILES_DIR"

echo "********************************************************************************"
echo "Bootstrap completed! Running install.sh..."
echo "********************************************************************************"

# Run the installation script
cd "$DOTFILES_DIR"
./install.sh
