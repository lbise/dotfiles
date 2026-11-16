#!/usr/bin/env bash
#
# Bootstrap a brand new Arch Linux installation: install git and yay, clone the
# dotfiles, then run the complete installer (dotfiles bootstrap).
#
# Needs a GitHub SSH key first (in ~/.ssh or a forwarded agent): the repo is
# cloned over SSH.
#
# Usage on a new Arch Linux machine, logged in as your user (not root):
#   curl -fsSL https://raw.githubusercontent.com/lbise/dotfiles/master/bootstrap.sh | bash
#
# Or review the script first:
#   curl -fsSL https://raw.githubusercontent.com/lbise/dotfiles/master/bootstrap.sh -o bootstrap.sh
#   bash bootstrap.sh

set -Eeuo pipefail

DOTFILES_DIR="$HOME/gitrepo/dotfiles"

# Everything lives in main so bash reads the whole script before running it.
# Under `curl | bash`, stdin is the script itself, so prompts read /dev/tty.
main() {
    echo "********************************************************************************"
    echo "Bootstrapping Leo's dotfiles on Arch Linux"
    echo "********************************************************************************"

    if [[ ! -f /etc/os-release ]] || ! grep -qi '^ID=arch' /etc/os-release; then
        echo "ERROR: This bootstrap script is only for Arch Linux" >&2
        exit 1
    fi
    if (( EUID == 0 )); then
        echo "ERROR: Run this as your user, not root. It uses sudo when needed." >&2
        exit 1
    fi

    echo ">> Upgrading the system and installing git and base-devel..."
    sudo pacman -Syu --noconfirm --needed git base-devel openssh

    if ! command -v yay &> /dev/null; then
        echo ">> Installing yay (AUR helper)..."
        local tmp_dir
        tmp_dir=$(mktemp -d)
        git clone https://aur.archlinux.org/yay.git "$tmp_dir/yay"
        (cd "$tmp_dir/yay" && makepkg -si --noconfirm)
        rm -rf "$tmp_dir"
    else
        echo ">> yay is already installed"
    fi

    if [[ -d "$DOTFILES_DIR" ]]; then
        echo ">> Dotfiles directory already exists at $DOTFILES_DIR"
        read -p "Do you want to remove it and re-clone? (y/N): " -n 1 -r < /dev/tty
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$DOTFILES_DIR"
        else
            echo "Aborting..."
            exit 1
        fi
    fi

    echo ">> Cloning dotfiles repository..."
    mkdir -p "$(dirname "$DOTFILES_DIR")"
    # accept-new: trust github.com's host key on first contact instead of prompting.
    if ! GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" \
        git clone git@github.com:lbise/dotfiles.git "$DOTFILES_DIR"; then
        echo "ERROR: SSH clone failed. Copy your GitHub SSH key to ~/.ssh first." >&2
        exit 1
    fi

    echo "********************************************************************************"
    echo "Bootstrap completed! Running the dotfiles bootstrap command..."
    echo "********************************************************************************"

    cd "$DOTFILES_DIR"
    ./scripts/dotfiles bootstrap < /dev/tty
}

main "$@"
