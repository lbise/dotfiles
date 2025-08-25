#!/usr/bin/env bash
# Package installation for different operating systems

# Source common variables and functions
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# Ubuntu package management
UBUNTU_UPDATE="sudo apt update"
UBUNTU_INSTALL="sudo apt install -y"

install_ubuntu_packages() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    OS_VER=$VERSION_ID
    print_section "Installing packages for Ubuntu-${OS_VER}"

    PKGS="$COMMON_PACKAGES $UBUNTU_COMMON_PACKAGES"

    if [ "$OS_VER" = "20.04" ]; then
        PKGS="$PKGS ctags"
    elif [ "$OS_VER" = "22.04" ]; then
        PKGS="$PKGS universal-ctags"
    elif [ "$OS_VER" = "24.04" ]; then
        PKGS="$PKGS python3.12-venv"
    fi

    $UBUNTU_UPDATE

    echo "> Installing following packages: $PKGS"
    $UBUNTU_INSTALL $PKGS
}

# MacOS package management
MACOS_UPDATE="brew update -v"
MACOS_UPGRADE="brew upgrade -v"
MACOS_INSTALL="brew install"

install_macos_packages() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    PKGS="$COMMON_PACKAGES $MAC_PACKAGES"

    print_section "Installing packages for MacOS"
    $MACOS_UPDATE
    $MACOS_UPGRADE
    $MACOS_INSTALL $PKGS

    # Install fonts
    brew tap homebrew/cask-fonts
    $MACOS_INSTALL font-jetbrains-mono-nerd-font
}

# Arch Linux package management
ARCH_UPDATE="sudo pacman -Syu"
ARCH_INSTALL="sudo pacman -S --needed"

install_arch_packages() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    PKGS="$COMMON_PACKAGES ctags"

    print_section "Installing packages for Arch Linux"
    $ARCH_UPDATE
    $ARCH_INSTALL $PKGS
}

# Main package installation dispatcher
install_packages() {
    case "$OS" in
        "Ubuntu")
            install_ubuntu_packages
            ;;
        "Darwin")
            install_macos_packages
            ;;
        "Arch Linux")
            install_arch_packages
            ;;
        *)
            echo "Unsupported OS for package installation: $OS"
            return 1
            ;;
    esac
}

# Allow this script to be run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    detect_os
    apply_test_mode
    install_packages
fi