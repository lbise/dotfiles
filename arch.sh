#!/usr/bin/env bash
# Specific install script for Arch Linux

# TODO:
# - wallpapers
# - greeter

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

# Packages to install
# gvim to have +clipboard
# gendesk for dropbox
PKGS="gvim zsh ctags python gdb cmsis-svd-git i3lock rofi feh xautolock xorg-server xorg-apps xorg-xrandr xorg-xinit kitty numlockx lightdm i3-gaps man-db man-pages thunar alsa-utils zip unzip minicom python-gitpython ntp samba gendesk gthumb networkmanager network-manager-applet evince"

# AUR to install
AUR_PKGS="polybar google-chrome lightdm-slick-greeter jlink-software-and-documentation dropbox thunar-dropbox thunar-archive-plugin plymouth plymouth-theme-dark-arch"
AUR_FONTS="nerd-fonts-source-code-pro noto-fonts-emoji"

# Services to enable
SERVICES="lightdm-plymouth NetworkManager"

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

echo "Setting up system:"
echo "	zsh"
sh -c "$(curl -fsSL https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh)"
# Change default shell to zsh
chsh -s $(which zsh)
echo "	ntp"
sudo systemctl enable ntpd.service
sudo systemctl start ntpd.service
echo "	plymouth"
if grep -Fq "sd-plymouth" /etc/mkinitcpio.conf; then
	echo "mkinit already setup for plymouth"
else
	echo "Setting up Plymouth"
	sudo sed -i 's/HOOKS=(base systemd autodetect/HOOKS=(base systemd sd-plymouth autodetect/g' /etc/mkinitcpio.conf
	sudo mkinitcpio -p linux
	if grep -Fq "vt.global_cursor_default=0" /etc/default/grub; then
		sudo sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT="loglevel=3 quiet/GRUB_CMDLINE_LINUX_DEFAULT="loglevel=3 quiet splash vt.global_cursor_default=0/g' /etc/default/grub
		sudo grub-mkconfig -o /boot/grub/grub.cfg
	else
		echo "Grub already setup for plymouth"
	fi
fi
sudo plymouth-set-default-theme -R dark-arch
echo "-------------------------------------------------------------------------"

echo "	fonts"
$AUR_INSTALL_CMD $AUR_FONTS
echo "-------------------------------------------------------------------------"

echo "Enabling services: $SERVICES"
sudo $ENABLE_SERVICE $SERVICES
echo "-------------------------------------------------------------------------"
