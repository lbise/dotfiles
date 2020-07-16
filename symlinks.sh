#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

# Vim
$DIR/tools/new_symlink.sh $DIR/.vimrc ~/.vimrc
$DIR/tools/new_symlink.sh $DIR/vim/ftplugin ~/.vim/ftplugin
$DIR/tools/new_symlink.sh $DIR/vim/pack ~/.vim/pack
$DIR/tools/new_symlink.sh $DIR/vim/colorschemes/nord-vim/colors/nord.vim ~/.vim/colors/nord.vim
$DIR/tools/new_symlink.sh $DIR/vim/colorschemes/nord-vim/autoload/airline/themes/nord.vim ~/.vim/autoload/airline/themes/nord.vim

# git
$DIR/tools/new_symlink.sh $DIR/.gitconfig ~/.gitconfig
$DIR/tools/new_symlink.sh $DIR/githooks ~/.githooks

