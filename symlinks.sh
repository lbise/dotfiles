#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

# rxvt
$DIR/tools/new_symlink.sh $DIR/.Xresources ~/.Xresources

# vim
$DIR/tools/new_symlink.sh $DIR/.vimrc ~/.vimrc
$DIR/tools/new_symlink.sh $DIR/vim/ftplugin ~/.vim/ftplugin
$DIR/tools/new_symlink.sh $DIR/vim/pack ~/.vim/pack
$DIR/tools/new_symlink.sh $DIR/vim/colorschemes/nord-vim/colors/nord.vim ~/.vim/colors/nord.vim
$DIR/tools/new_symlink.sh $DIR/vim/colorschemes/nord-vim/autoload/airline/themes/nord.vim ~/.vim/autoload/airline/themes/nord.vim

# git
$DIR/tools/new_symlink.sh $DIR/.gitconfig ~/.gitconfig
$DIR/tools/new_symlink.sh $DIR/githooks ~/.githooks

# Exuberant ctags
$DIR/tools/new_symlink.sh $DIR/.ctags ~/.ctags
# Universal ctags
$DIR/tools/new_symlink.sh $DIR/.ctags ~/.ctags.d/default.ctags

# gdb
$DIR/tools/new_symlink.sh $DIR/gdb/gdb-dashboard/.gdbinit ~/.gdbinit
$DIR/tools/new_symlink.sh $DIR/.gdbinit ~/.gdbinit.d/.gdbinit

# i3
$DIR/tools/new_symlink.sh $DIR/config/i3/config ~/.config/i3/config
$DIR/tools/new_symlink.sh $DIR/config/rofi/config ~/.config/rofi/config
sudo $DIR/tools/new_symlink.sh $DIR/rofi/nord-rofi/nord.rasi /usr/share/rofi/themes/nord.rasi

# zsh
$DIR/tools/new_symlink.sh $DIR/.zshrc  ~/.zshrc
$DIR/tools/new_symlink.sh $DIR/powerlevel10k  ~/.oh-my-zsh/custom/themes/powerlevel10k

# X11
sudo $DIR/tools/new_symlink.sh $DIR/00-keyboard.conf  /etc/X11/xorg.conf.d/00-keyboard.conf

# kitty
$DIR/tools/new_symlink.sh $DIR/config/kitty/kitty.conf ~/.config/kitty/kitty.conf
$DIR/tools/new_symlink.sh $DIR/nord-kitty/nord.conf ~/.config/kitty/nord.conf

# lightdm
sudo $DIR/tools/new_symlink.sh $DIR/lightdm.conf  /etc/lightdm/lightdm.conf
sudo $DIR/tools/new_symlink.sh $DIR/scripts/display_setup.sh  /usr/share/display_setup.sh
sudo $DIR/tools/new_symlink.sh $DIR/scripts/xrandr_home.sh  /usr/share/xrandr_home.sh
sudo $DIR/tools/new_symlink.sh $DIR/scripts/xrandr_docked.sh  /usr/share/xrandr_docked.sh
sudo $DIR/tools/new_symlink.sh $DIR/scripts/xrandr_laptop.sh  /usr/share/xrandr_laptop.sh

# scripts
sudo $DIR/tools/new_symlink.sh $DIR/scripts  ~/.scripts

# polybar
$DIR/tools/new_symlink.sh $DIR/config/polybar/config ~/.config/polybar/config
$DIR/tools/new_symlink.sh $DIR/config/polybar/launch.sh ~/.config/polybar/launch.sh
$DIR/tools/new_symlink.sh $DIR/config/polybar/nord-colors ~/.config/polybar/colors
$DIR/tools/new_symlink.sh $DIR/config/polybar/global-config ~/.config/polybar/global-config
