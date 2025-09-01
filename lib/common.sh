#!/usr/bin/env bash
# Common variables and utilities for dotfiles installation
set -euo pipefail

# Get the directory where this script is located
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(dirname "$LIB_DIR")"

# Common command aliases
RM_RF="rm -rf"
LN_SF="ln -sf"
SH_C="sh -c"
CHSH_S="chsh -s"
X_ON="set -x"
X_OFF="set +x"
CHMOD="chmod"
CP="cp"
MV="mv"
MKDIR="mkdir"
UNTAR="tar xf"

# Path configurations
ONEDRIVE_PATH="/mnt/c/Users/13lbise/OneDrive - Sonova"
KEYS_SSH_DIR="$ONEDRIVE_PATH/.ssh"
KEYS_GPG_DIR="$ONEDRIVE_PATH/.gnupg"

# Package lists
COMMON_PACKAGES="zsh fzf ripgrep gzip tmux curl wget unzip tar npm pass"
UBUNTU_COMMON_PACKAGES="fd-find pinentry-tty build-essential gdb"
MAC_PACKAGES="fd gpg universal-ctags nvim"

# Software versions and paths
NVIM_PLUGINS_MD5=$(cat "$(cd "$(dirname "${BASH_SOURCE[0]}")" && realpath ../archives)/plugins.md5")
GPG_KEYID="ED0DFB79FF83B277"

# Global flags (set by main install script)
TEST_MODE=${TEST_MODE:-0}
LINK_ONLY=${LINK_ONLY:-0}
WORK_INSTALL=${WORK_INSTALL:-0}
COPY_VIM=${COPY_VIM:-0}
WSL_ONLY=${WSL_ONLY:-0}
WSL=${WSL:-0}

# Utility functions
print_section() {
    echo "-------------------------------------------------------------------------"
    echo "$1"
}

# Apply test mode overrides if enabled
apply_test_mode() {
    if [ "$TEST_MODE" = 1 ] || [ "$LINK_ONLY" = 1 ]; then
        RM_RF="echo test: ${RM_RF}"
        LN_SF="echo test: ${LN_SF}"
        CHSH_S="echo test: ${CHSH_S}"
        X_ON=""
        X_OFF=""
        CHMOD="echo test: ${CHMOD}"
        CP="echo test: ${CP}"
        MV="echo test: ${MV}"
        MKDIR="echo test: ${MKDIR}"
        UNTAR="echo test: ${UNTAR}"
    fi

    if [ "$LINK_ONLY" = 1 ]; then
        RM_RF="rm -rf"
        LN_SF="ln -sf"
    fi
}

# OS Detection
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
    else
        OS=$(uname -s)
    fi
    export OS
}

# WSL Detection
detect_wsl() {
    WSL=0
    if [[ "$OS" == "Ubuntu" ]]; then
        if grep -qi microsoft /proc/version; then
            WSL=1
        fi
    fi
    export WSL
}

# Source this file to get all variables and functions
export DOTFILES_DIR LIB_DIR
export RM_RF LN_SF SH_C CHSH_S X_ON X_OFF CHMOD CP MV MKDIR UNTAR
export ONEDRIVE_PATH KEYS_SSH_DIR KEYS_GPG_DIR
export COMMON_PACKAGES UBUNTU_COMMON_PACKAGES MAC_PACKAGES
export NVIM_PLUGINS_MD5 GPG_KEYID
export TEST_MODE LINK_ONLY WORK_INSTALL COPY_VIM WSL_ONLY WSL
