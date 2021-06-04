#!/usr/bin/env bash

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
DOTFILES="$DIR/.."

WINTERMCFG="`wslpath "$(wslvar USERPROFILE)"`/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json"

echo "-------------------------------------------------------------------------"
echo "Windows specific configuration"
sudo rm -rf $WINTERMCFG
cp $DOTFILES/win/winterm.settings.json $WINTERMCFG

echo "#########################################################################"
echo "Windows installation completed"
echo "#########################################################################"
