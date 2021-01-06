:: Create required symbolic links for window
@echo off
SET mypath=%~dp0
SET DIR=%mypath:~0,-1%

mklink "%OneDrive%/.gitconfig" "%OneDrive%/dotfiles/.gitconfigwork"

:: vim stuff
mkdir "%OneDrive%/vimfiles"
mklink "%OneDrive%/_vimrc" "%OneDrive%/dotfiles/.vimrc"
mklink "%OneDrive%/_gvimrc" "%OneDrive%/dotfiles/.gvimrc"
mklink /D "%OneDrive%/vimfiles/pack" "%OneDrive%/dotfiles/vim/pack"

mkdir "%OneDrive%/vimfiles/colors"
mklink "%OneDrive%/vimfiles/colors/nord.vim" "%OneDrive%/dotfiles/vim/colorschemes/nord-vim/colors/nord.vim"
