#!/usr/bin/env bash
HOSTNAME=`hostname`
HOME="leo-arch"
WORK="leo-work"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

echo "Configuring display for $HOSTNAME"
if [ "$HOSTNAME" = "$HOME" ]; then
	echo "Home setup"
	$DIR/xrandr_home.sh
elif [ "$HOSTNAME" = "$work" ]; then
	echo "Work setup"
	# TODO: Detect docked/undocked
	$DIR/xrandr_laptop.sh
fi
