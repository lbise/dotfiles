#!/usr/bin/env bash
# Specific install script for Arch Linux

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

# Packages to install
PKGS="vim zsh ctags python gdb i3lock rofi feh xautolock xorg-server xorg-apps xorg-xrandr xorg-xinit kitty numlockx lightdm lightdm-webkit2-greeter i3-gaps man-db man-pages"

# AUR to install
AUR_PKGS="google-chrome"

# Services to enable
SERVICES="lightdm"

# Commands
ENABLE_SERVICE="systemctl enable "
INSTALL_CMD="pacman -S --needed "
AUR_INSTALL_CMD="yay -S --needed "
AUR_HELPER_DST="$DIR/../yay"

echo "Installing packages: $PKGS $PKGS_DIST"
sudo $INSTALL_CMD $PKGS
echo "-------------------------------------------------------------------------"

echo "Installing AUR helper"
if [ -d "$AUR_HELPER_DST" ]; then
	echo "$AUR_HELPER_DST exists, skipping AUR helper installation..."
else
	git clone https://aur.archlinux.org/yay.git $AUR_HELPER_DST
	cd $AUR_HELPER_DST
	makepkg -si
	cd $DIR
fi
echo "-------------------------------------------------------------------------"

echo "Installing AUR packages: $AUR_PKGS"
$AUR_INSTALL_CMD $AUR_PKGS
echo "-------------------------------------------------------------------------"

echo "Enabling services: $SERVICES"
sudo $ENABLE_SERVICE $SERVICES
echo "-------------------------------------------------------------------------"