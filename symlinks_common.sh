#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

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

# zsh
$DIR/tools/new_symlink.sh $DIR/.zshrc  ~/.zshrc
$DIR/tools/new_symlink.sh $DIR/powerlevel10k  ~/.oh-my-zsh/custom/themes/powerlevel10k

# scripts
$DIR/tools/new_symlink.sh $DIR/scripts  ~/.scripts

