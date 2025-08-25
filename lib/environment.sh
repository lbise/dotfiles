#!/usr/bin/env bash
# Environment-specific installation functions (WSL, work, etc.)

# Source common variables and functions
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

install_work() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    print_section "Work specific install"
    # Add any work-specific installations here
    # Currently empty but can be extended
}

install_for_wsl() {
    print_section "WSL specific install"

    echo "Copying Windows Terminal config..."
    WINHOME=$(wslpath "$(cmd.exe /C "echo %USERPROFILE%")" | sed 's/\r$//')
    WINTERMCFG="${WINHOME}/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json"
    $RM_RF "$WINTERMCFG"
    $CP "$DOTFILES_DIR/win/winterm.settings.json" "$WINTERMCFG"
}

# Install environment-specific components
install_environment() {
    if [ "$WORK_INSTALL" = 1 ]; then
        install_work
    fi

    if [ "$WSL" = 1 ]; then
        install_for_wsl
    fi
}

# Allow this script to be run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    detect_os
    detect_wsl
    apply_test_mode
    install_environment
fi