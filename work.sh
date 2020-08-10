#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

PKGS="evolution evolution-ews python-ecdsa go"
AUR_PKGS="netextender"

# Commands
ENABLE_SERVICE="systemctl enable "
INSTALL_CMD="pacman -S --needed "
AUR_INSTALL_CMD="yay -S --needed "

echo "Installing packages: $PKGS"
sudo $INSTALL_CMD $PKGS
echo "-------------------------------------------------------------------------"

echo "Installing AUR packages: $AUR_PKGS"
$AUR_INSTALL_CMD $AUR_PKGS
echo "-------------------------------------------------------------------------"

echo "Setting up system:"
echo "	pppd"
# Prevent pppd: must be root to run pppd, since it is not setuid-root
sudo chmod u+s /usr/sbin/pppd
echo "	go"
mkdir -p $HOME/go/src
go env -w GOPRIVATE="geo-satis.com/golang"
git config --global url."ssh://git@gstjira1.ju.geo-satis.com:7999/".insteadof "https://geo-satis.com/golang/"
if [ -f $HOME/.ssh/config ]; then
	echo "Host *\n\tUser lbise" > $HOME/.ssh/config
	chmod 600 $HOME/.ssh/config
else
	echo "~/.ssh/config exists, skipping"
fi
echo "-------------------------------------------------------------------------"
