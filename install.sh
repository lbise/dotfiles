#!/usr/bin/env bash
# Leo's dotfiles install script
set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source all modules
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/symlinks.sh"
source "$SCRIPT_DIR/lib/packages.sh"
source "$SCRIPT_DIR/lib/software.sh"
source "$SCRIPT_DIR/lib/keys.sh"
source "$SCRIPT_DIR/lib/environment.sh"

function print_usage() {
    USAGE="$(basename "$0") [-h|--help] [-p|--profile PROFILE] [-t|--test] -- Install dotfiles using config files

        where:
            -h|--help: Print this help
            -p|--profile PROFILE: Use predefined profile (minimal, developer, server)
            -t|--test: Do not perform any operation just print
            -w|--work: Perform installation for work environment
            -k|--keys: Folder to find keys to install
            -s|--wslonly: Perform WSL installation only

        Profiles:
            minimal:   Symlinks only
            developer: Full development setup
            server:    Server environment (no GUI tools)"
    echo "$USAGE"
}

function install_from_profile() {
    local profile="$1"

    print_section "Installing using profile: $profile"

    case "$profile" in
        "minimal")
            export SKIP_PACKAGES=1
            export SKIP_SOFTWARE=1
            export SKIP_KEYS=1
            setup_symlinks
            ;;
        "server")
            export SKIP_APPLICATIONS=1
            install_packages
            install_software
            setup_symlinks
            ;;
        "developer"|"")
            # Full installation
            install_packages
            install_software
            setup_symlinks
            install_keys
            install_environment
            ;;
        *)
            echo "Unknown profile: $profile"
            echo "Available profiles: minimal, developer, server"
            exit 1
            ;;
    esac
}

function test_yaml_config() {
    print_section "Testing YAML configuration parsing"

    echo "=== Common packages ==="
    get_yaml_array "packages.yml" "common"

    echo "=== Ubuntu additional packages ==="
    get_yaml_array "packages.yml" "ubuntu.additional"

    echo "=== Node.js version ==="
    get_software_config "nodejs" "version"

    echo "=== Core symlinks ==="
    get_symlinks "core"

    echo "=== Package manager commands ==="
    echo "Ubuntu update: $(get_package_manager_command "ubuntu" "update")"
    echo "Ubuntu install: $(get_package_manager_command "ubuntu" "install")"
}

echo "#########################################################################"
echo "Leo's dotfiles install script"
echo "#########################################################################"

# Initialize global variables
TEST_MODE=0
WORK_INSTALL=0
COPY_VIM=0
WSL_ONLY=0
PROFILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--test)
            TEST_MODE=1
            shift
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
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
        --test-yaml)
            test_yaml_config
            exit 0
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
export TEST_MODE WORK_INSTALL COPY_VIM WSL_ONLY

# Detect OS and WSL
detect_os
detect_wsl

# Apply test mode overrides
apply_test_mode

# Load YAML configuration
load_config

# Run installation based on profile or default
if [ -n "$PROFILE" ]; then
    install_from_profile "$PROFILE"
else
    install_from_profile "developer"
fi

echo "#########################################################################"
echo "Installation completed"
echo "#########################################################################"
