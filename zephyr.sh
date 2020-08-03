#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

echo "#########################################################################"
echo "Zephyr installation"
echo "#########################################################################"

PKGS="git cmake ninja gperf ccache dfu-util dtc wget python-setuptools python-wheel tk xz file make"
PKGS_PYTHON="python-yaml python-pyelftools python-protobuf"

SDK_VERS=("0.10.0" "0.11.4")

# Commands
ENABLE_SERVICE="systemctl enable "
INSTALL_CMD="pacman -S --needed "
AUR_INSTALL_CMD="yay -S --needed "

echo "Installing packages: $PKGS $PKGS_PYTHON"
sudo $INSTALL_CMD $PKGS $PKGS_PYTHON
echo "-------------------------------------------------------------------------"

echo "Installing SDK:"
mkdir ~/Downloads
cd ~/Downloads

for SDK_VER in "${SDK_VERS[@]}"
do
	if [ ! -d "/opt/zephyr-sdk-${SDK_VER}" ]; then
		echo "Installing SDK v${SDK_VER}"
		wget -P ~/Downloads https://github.com/zephyrproject-rtos/sdk-ng/releases/download/v${SDK_VER}/zephyr-sdk-${SDK_VER}-setup.run
		sudo sh zephyr-sdk-${SDK_VER}-setup.run
		rm zephyr-sdk-${SDK_VER}-setup.run
	else
		echo "/opt/zephyr-sdk-${SDK_VER} already installed"
	fi
done 
echo "-------------------------------------------------------------------------"
