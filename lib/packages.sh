#!/usr/bin/env bash
# YAML-driven package installation for different operating systems

# Source common variables and configuration utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

install_packages_from_config() {
    local os="$1"
    local version="$2"

    if [ "$WSL_ONLY" = 1 ]; then
        print_section "Skipping package installation (WSL_ONLY mode)"
        return
    fi

    print_section "Installing packages for $os using YAML config"

    # Get package manager commands from config
    local update_cmd=$(get_package_manager_command "$os" "update")
    local install_cmd=$(get_package_manager_command "$os" "install")
    local upgrade_cmd=$(get_package_manager_command "$os" "upgrade")

    # Get packages to install
    local packages=$(get_packages_for_os "$os" "$version")

    echo "Update command: $update_cmd"
    echo "Install command: $install_cmd"
    echo "Packages to install:"
    echo "$packages"

    if [ -n "$update_cmd" ]; then
        echo "Running update..."
        eval "$update_cmd"
    fi

    if [ -n "$upgrade_cmd" ]; then
        echo "Running upgrade..."
        eval "$upgrade_cmd"
    fi

    if [ -n "$packages" ] && [ -n "$install_cmd" ]; then
        # Convert newline-separated packages to space-separated
        local pkg_list=$(echo "$packages" | tr '\n' ' ' | sed 's/[[:space:]]*$//')
        echo "Installing packages: $pkg_list"
        eval "$install_cmd $pkg_list"
    fi

    # Handle special cases per OS
    case "$os" in
        "macos")
            install_macos_fonts
            ;;
    esac
}

install_macos_fonts() {
    local font_tap=$(get_package_manager_command "macos" "font_tap")
    local install_cmd=$(get_package_manager_command "macos" "install")

    if [ -n "$font_tap" ]; then
        echo "Setting up font tap..."
        eval "$font_tap"
    fi

    # Get fonts from config
    local fonts=$(get_yaml_array "packages.yml" "macos.fonts")
    if [ -n "$fonts" ]; then
        local font_list=$(echo "$fonts" | tr '\n' ' ' | sed 's/[[:space:]]*$//')
        echo "Installing fonts: $font_list"
        eval "$install_cmd $font_list"
    fi
}

install_ubuntu_packages() {
    local version="${VERSION_ID:-22.04}"
    install_packages_from_config "ubuntu" "$version"
}

install_macos_packages() {
    install_packages_from_config "macos"
}

install_arch_packages() {
    install_packages_from_config "arch"
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
