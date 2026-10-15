#!/usr/bin/env bash
#
# One-time setup for an Arch Linux desktop or laptop.
#
# Installs the system stack the dotfiles assume (Hyprland session, SDDM, audio,
# network, Bluetooth) and configures what only needs doing once per machine:
# pacman options, services, fonts, the SDDM theme and laptop power management.
#
# Apps and tools belong in packages_arch.sh, which is meant to be rerun.
# This script is idempotent, so rerunning it after adding a step is safe.
# Services are enabled but not started; reboot when it finishes.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/helpers.sh"

PACMAN_CONF=${PACMAN_CONF:-/etc/pacman.conf}
NM_WIFI_BACKEND_CONF=${NM_WIFI_BACKEND_CONF:-/etc/NetworkManager/conf.d/wifi-backend.conf}

SYSTEM_PKGS=(
    # Session: Hyprland started by uwsm from SDDM
    hyprland uwsm
    # SDDM's greeter runs on X11 by default
    sddm xorg-server
    xdg-desktop-portal-hyprland xdg-desktop-portal-gtk
    qt5-wayland qt6-wayland
    polkit-kde-agent
    # Audio
    pipewire pipewire-alsa pipewire-pulse wireplumber
    # Network: NetworkManager for the bar, iwd as its Wi-Fi backend for impala
    networkmanager iwd
    # Bluetooth
    bluez bluez-utils
    # Battery and desktop plumbing
    upower xdg-user-dirs xdg-utils
    # Fonts installers and base fonts
    curl unzip fontconfig noto-fonts noto-fonts-emoji ttf-liberation
    # system-login-install.sh
    python
)

SYSTEM_SERVICES=(
    NetworkManager.service
    iwd.service
    bluetooth.service
    sddm.service
    systemd-timesyncd.service
    fstrim.timer
)

LAPTOP_PKGS=(power-profiles-daemon)
LAPTOP_SERVICES=(power-profiles-daemon.service)

step() {
    echo ">> $*"
}

is_laptop() {
    compgen -G "/sys/class/power_supply/BAT*" >/dev/null
}

# Install stdin as a root-owned file, unless the file already has that content.
write_root_file() {
    local dst=$1 tmp
    tmp=$(mktemp)
    cat > "$tmp"
    if cmp -s "$tmp" "$dst"; then
        echo "$dst already configured"
    else
        sudo install -D -m 644 "$tmp" "$dst"
        echo "Wrote $dst"
    fi
    rm -f "$tmp"
}

# Enable Color, ParallelDownloads and the multilib repository (needed for Steam).
configure_pacman() {
    sed -e 's/^#Color$/Color/' \
        -e 's/^#ParallelDownloads/ParallelDownloads/' \
        -e '/^#\[multilib\]$/{s/^#//;n;s/^#Include/Include/}' \
        "$PACMAN_CONF" | write_root_file "$PACMAN_CONF"
}

install_system_packages() {
    local pkgs=("${SYSTEM_PKGS[@]}")
    if is_laptop; then
        pkgs+=("${LAPTOP_PKGS[@]}")
    fi
    # -Syu, not -Sy: syncing without upgrading leaves a partial upgrade.
    sudo pacman -Syu --noconfirm --needed "${pkgs[@]}"
}

configure_network() {
    printf '[device]\nwifi.backend=iwd\n' | write_root_file "$NM_WIFI_BACKEND_CONF"

    if systemctl is-enabled --quiet systemd-networkd.service 2>/dev/null; then
        echo "WARNING: systemd-networkd is enabled and will fight NetworkManager." >&2
        echo "After rebooting and checking that NetworkManager works, run:" >&2
        echo "  sudo systemctl disable --now systemd-networkd.service" >&2
    fi
}

enable_services() {
    local services=("${SYSTEM_SERVICES[@]}")
    if is_laptop; then
        services+=("${LAPTOP_SERVICES[@]}")
    fi
    # Enable only: starting NetworkManager now could drop the connection
    # mid-install, and starting SDDM would take over this TTY.
    sudo systemctl enable "${services[@]}"
}

enable_user_services() {
    if command -v elephant >/dev/null 2>&1; then
        elephant service enable
    else
        echo "elephant not installed, skipping its user service"
    fi
    xdg-user-dirs-update
}

install_fonts() {
    "$SCRIPT_DIR/fonts.sh"
}

# Copies the theme plus fonts from ~/.local/share/fonts, so fonts come first.
install_login_theme() {
    "$DOTFILES_ROOT/scripts/system/system-login-install.sh"
}

main() {
    is_arch || { echo "setup_arch.sh only supports Arch Linux" >&2; exit 1; }
    (( EUID != 0 )) || { echo "Run setup_arch.sh as your user, not root" >&2; exit 1; }

    step "Configuring pacman"
    configure_pacman
    step "Installing the system stack"
    install_system_packages
    step "Configuring NetworkManager"
    configure_network
    step "Enabling system services"
    enable_services
    step "Enabling user services"
    enable_user_services
    step "Installing fonts"
    install_fonts
    step "Installing the SDDM theme"
    install_login_theme

    echo "Arch setup done. Reboot to start SDDM and the new services."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
