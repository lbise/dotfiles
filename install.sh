#!/usr/bin/env bash
# Install dotfiles and setup system

PKGS="vim zsh ctags python gdb i3lock rofi feh xautolock"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

echo "#########################################################################"
echo "Leo's dotfiles install script"
echo "#########################################################################"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
else
    # Fall back to uname, e.g. "Linux <version>", also works for BSD, etc.
    OS=$(uname -s)
fi

echo "OS: $OS"

case "$OS" in
	"Arch Linux")
		ENABLE_SERVICE="systemctl enable "
		INSTALL_CMD="pacman -S --needed "
		PKGS_DIST="xorg-server lightdm lightdm-webkit2-greeter i3-gaps man-db man-pages"
		SERVICES="lightdm"
		;;
	"Fedora")
		ENABLE_SERVICE="systemctl start "
		INSTALL_CMD="dnf install "
		PKGS_DIST="i3 i3status gnome-tweaks"
		SERVICES=""
		;;
	*)
		echo "Unsupported OS: $OS"
		exit 1
		;;
esac

echo "Initializing git submodules:"
git submodule update --init --recursive
echo "-------------------------------------------------------------------------"

echo "Installing packages: $PKGS $PKGS_DIST"
sudo $INSTALL_CMD $PKGS $PKGS_DIST
echo "-------------------------------------------------------------------------"

echo "Enabling services: $SERVICES"
sudo $ENABLE_SERVICE $SERVICES
echo "-------------------------------------------------------------------------"

echo "Installation completed"
echo "-------------------------------------------------------------------------"
