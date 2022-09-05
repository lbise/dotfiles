#!/usr/bin/env bash

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
DOTFILES="$DIR/.."

WINHOME=$(wslpath $(cmd.exe /C "echo %USERPROFILE%") | sed 's/\r$//')
WINTERMCFG="${WINHOME}/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json"

echo "-------------------------------------------------------------------------"
echo "Update dotfiles Windows Terminal configuration file"
cp $WINTERMCFG $DOTFILES/win/winterm.settings.json

echo "#########################################################################"
echo "Get config end"
echo "#########################################################################"
