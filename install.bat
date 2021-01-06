:: Install dotfiles and setup system
@echo off
SET mypath=%~dp0
SET DIR=%mypath:~0,-1%

echo "#########################################################################"
echo "Leo's dotfiles install script"
echo "#########################################################################"

echo "Initializing git submodules:"
git submodule update --init --recursive
echo "-------------------------------------------------------------------------"

echo "Creating symlinks:"
echo "-------------------------------------------------------------------------"
CALL "%DIR%/symlinks.bat"

echo "Installation completed"
echo "#########################################################################"
