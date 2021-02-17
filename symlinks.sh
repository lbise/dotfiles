#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

$DIR/symlinks_common.sh

# rxvt
$DIR/tools/new_symlink.sh $DIR/.Xresources ~/.Xresources

# i3
$DIR/tools/new_symlink.sh $DIR/config/i3/config ~/.config/i3/config
$DIR/tools/new_symlink.sh $DIR/config/rofi/config ~/.config/rofi/config
sudo $DIR/tools/new_symlink.sh $DIR/rofi/nord-rofi/nord.rasi /usr/share/rofi/themes/nord.rasi

# X11
sudo $DIR/tools/new_symlink.sh $DIR/00-keyboard.conf  /etc/X11/xorg.conf.d/00-keyboard.conf

# kitty
$DIR/tools/new_symlink.sh $DIR/config/kitty/kitty.conf ~/.config/kitty/kitty.conf
$DIR/tools/new_symlink.sh $DIR/nord-kitty/nord.conf ~/.config/kitty/nord.conf

# lightdm - files need to be copied
sudo cp $DIR/lightdm.conf /etc/lightdm/lightdm.conf
sudo cp $DIR/slick-greeter.conf /etc/lightdm/slick-greeter.conf
sudo cp $DIR/greeter_background.jpg /usr/share/pixmaps/greeter_background.jpg
sudo cp $DIR/scripts/display_setup.sh /usr/share/display_setup.sh
sudo cp $DIR/scripts/xrandr_home.sh /usr/share/xrandr_home.sh
sudo cp $DIR/scripts/xrandr_docked.sh /usr/share/xrandr_docked.sh
sudo cp $DIR/scripts/xrandr_laptop.sh /usr/share/xrandr_laptop.sh

# polybar
$DIR/tools/new_symlink.sh $DIR/config/polybar/config ~/.config/polybar/config
$DIR/tools/new_symlink.sh $DIR/config/polybar/launch.sh ~/.config/polybar/launch.sh
$DIR/tools/new_symlink.sh $DIR/config/polybar/nord-colors ~/.config/polybar/colors
$DIR/tools/new_symlink.sh $DIR/config/polybar/global-config ~/.config/polybar/global-config
