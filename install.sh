#!/usr/bin/env bash
# Main install script for Leo's dotfiles - modular version
set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source all modules
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/symlinks.sh"
source "$SCRIPT_DIR/lib/packages.sh"
source "$SCRIPT_DIR/lib/software.sh"
source "$SCRIPT_DIR/lib/keys.sh"
source "$SCRIPT_DIR/lib/environment.sh"

function print_usage() {
    USAGE="$(basename "$0") [-h|--help] [-l|--linkonly] [-t|--test] -- Install dotfiles

        where:
            -h|--help: Print this help
            -l|--linkonly: Only perform symlink setup. Do not install packages.
            -w|--work: Perform installation for work.
            -k|--keys: Folder to find keys to install
            -s|--wslonly: Perform WSL installation only.
            -t|--test: Do not perform any operation just print
            -c|--copyvim: Copy VIM plugins (Used when no internet access available)"
    echo "$USAGE"
}

function install_common() {
    print_section "Installing common items"

    # Install software components
    install_software

    # Setup symlinks
    setup_symlinks
}

function install_ubuntu() {
    install_ubuntu_packages
    install_common
}

function install_macos() {
    install_macos_packages  
    install_common
}

function install_arch() {
    install_arch_packages
    install_common
}

echo "#########################################################################"
echo "Leo's dotfiles install script (modular version)"
echo "#########################################################################"

# Initialize global variables
TEST_MODE=0
LINK_ONLY=0
WORK_INSTALL=0
COPY_VIM=0
WSL_ONLY=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--test)
            TEST_MODE=1
            shift
            ;;
        -l|--linkonly)
            LINK_ONLY=1
            shift
            ;;
        -w|--work)
            WORK_INSTALL=1
            shift
            ;;
        -k|--keys)
            KEYS_SSH_DIR="$2"
            KEYS_GPG_DIR="$2"
            shift 2
            ;;
        -s|--wslonly)
            WSL_ONLY=1
            shift
            ;;
        -c|--copyvim)
            COPY_VIM=1
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# Export variables for use by modules
export TEST_MODE LINK_ONLY WORK_INSTALL COPY_VIM WSL_ONLY

# Detect OS and WSL
detect_os
detect_wsl

# Apply test mode overrides
apply_test_mode

# Handle link-only mode
if [ "$LINK_ONLY" = 1 ]; then
    setup_symlinks
    echo "#########################################################################"
    echo "Symlink setup completed"
    echo "#########################################################################"
    exit 0
fi

# Main installation based on OS
case "$OS" in
    "Ubuntu")
        install_ubuntu
        ;;
    "Darwin")
        install_macos
        ;;
    "Arch Linux")
        install_arch
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Install keys
install_keys

# Install environment-specific components
install_environment

echo "#########################################################################"
echo "Installation completed"
echo "#########################################################################"