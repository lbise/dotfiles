#!/usr/bin/env bash
# Install dotfiles and setup system

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

################################################################################
# Common
################################################################################

GIT_SUBMODULE_INIT="git submodule update --init --recursive"
RM_RF="sudo rm -rf"
LN_SF="ln -sf"
ZSH_INSTALL="install_ohmyzsh"
SH_C="sh -c"
CHSH_S="chsh -s"
X_ON="set -x"
X_OFF="set +x"
CHMOD="chmod"
CP="cp"
MKDIR="mkdir"

function print_usage() {
    USAGE="$(basename "$0") [-h|--help] [-l|--linkonly] [-t|--test] -- Install dotfiles

        where:
            -h|--help: Print this help
            -l|--linkonly: Only perform symlink setup. Do not install packages.
            -w|--work: Perform installation for work.
            -t|--test: Do not perfrom any operation just print"
    echo "$USAGE"
}

function rm_symlinks() {
    echo "-------------------------------------------------------------------------"
    echo "Deleting existing dotfiles"
    $X_ON
    $RM_RF ~/.vimrc
    $RM_RF ~/.vim
    $RM_RF ~/.gitconfig
    $RM_RF ~/.githooks
    $RM_RF ~/.zshrc
    $RM_RF ~/.ctags
    $RM_RF ~/.scripts
    $X_OFF
}

function ln_symlinks() {
    echo "-------------------------------------------------------------------------"
    echo "Create symbolic links"
    $X_ON
    $LN_SF $DIR/.vimrc ~/.vimrc
    $LN_SF $DIR/vim ~/.vim
    if [ "$WORK_INSTALL" = 1 ]; then
        $LN_SF $DIR/.gitconfigwork ~/.gitconfig
    else
        $LN_SF $DIR/.gitconfig ~/.gitconfig
    fi
    $LN_SF $DIR/githooks ~/.githooks
    $LN_SF $DIR/.zshrc ~/.zshrc
    $LN_SF $DIR/.ctags ~/.ctags
    $LN_SF $DIR/scripts ~/.scripts
    $X_OFF
}

function install_ohmyzsh() {
	sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
}

function install_zsh() {
    echo "-------------------------------------------------------------------------"
    echo "Installing zsh..."
    if [ -z "$ZSH" ]; then
        $ZSH_INSTALL
    fi

    # Change default shell to zsh
    if [ "$SHELL" != "$(which zsh)" ]; then
        $CHSH_S $(which zsh)
    fi
}

function install_keys_sonova() {
    echo "-------------------------------------------------------------------------"
    echo "Installing SSH keys..."

    if [ "$WSL" = 0 ]; then
        echo "Cannot install keys automatically on native Ubuntu!"
        return
    fi

    ONEDRIVE_PATH="/mnt/c/Users/13lbise/OneDrive - Sonova"
    SSH_NAME="id_ed25519_git_sonova"
    SSH_PATH="$ONEDRIVE_PATH/.ssh"
    SSH_PRIV="$SSH_PATH/$SSH_NAME"
    SSH_PUB="$SSH_PATH/$SSH_NAME.pub"
    PGP_PATH="$ONEDRIVE_PATH/.gnupg"
    PGP_PRIV_NAME="sonova_private.pgp"
    PGP_PUB_NAME="sonova_public.pgp"
    PGP_PRIV="$PGP_PATH/$PGP_PRIV_NAME"
    PGP_PUB="$PGP_PATH/$PGP_PUB_NAME"

    if [[ ! -d ~/.ssh ]]; then
		$MKDIR ~/.ssh
        $CHMOD 700 ~/.ssh
    fi

    if [ ! -f ~/.ssh/$SSH_NAME ] || [ ! -f ~/.ssh/$SSH_NAME.pub ]; then
	    $CP "$SSH_PRIV" ~/.ssh
	    $CHMOD 600 ~/.ssh/$SSH_NAME
	    $CP "$SSH_PUB" ~/.ssh
	    $CHMOD 644 ~/.ssh/$SSH_NAME.pub
    fi

    if [[ ! -d ~/.gnupg ]]; then
		$MKDIR ~/.gnupg
        $CHMOD 700 ~/.gnupg
    fi

    if [ ! -f ~/.gnupg/$PGP_PRIV_NAME ] || [ ! -f ~/.ssh/$PGP_PUB_NAME ]; then
        # For pinentry configuration (passphrase enter in command line)
        $CP "$PGP_PATH/gpg.conf" ~/.gnupg
	    $CP "$PGP_PRIV" ~/.gnupg
	    $CHMOD 600 ~/.gnupg/$PGP_PRIV_NAME
	    $CP "$PGP_PUB" ~/.gnupg
	    $CHMOD 644 ~/.gnupg/$PGP_PUB_NAME
    fi
}

function install_work() {
    echo "Work specific install..."
    install_keys_sonova
}

function install_for_wsl() {
    echo "-------------------------------------------------------------------------"
    echo "WSL specific install..."

    echo "Copying Windows Terminal config..."
    WINHOME=$(wslpath $(cmd.exe /C "echo %USERPROFILE%") | sed 's/\r$//')
    WINTERMCFG="${WINHOME}/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json"
    $RM_RF $WINTERMCFG
    $CP $DIR/win/winterm.settings.json $WINTERMCFG
}

################################################################################
# Ubuntu
################################################################################
UBUNTU_UPDATE="sudo apt update"
UBUNTU_INSTALL="sudo apt install -y "

function install_ubuntu_22_04() {
    PKGS="exuberant-ctags"
    $UBUNTU_INSTALL $PKGS
}

function install_ubuntu_20_04() {
    PKGS="ctags"
    $UBUNTU_INSTALL $PKGS
}

function install_ubuntu_common() {
    PKGS="zsh fzf"
    if [ "$WORK_INSTALL" = 1 ]; then
        PKGS="$PKGS git-lfs"
    fi

    $UBUNTU_UPDATE
    $UBUNTU_INSTALL $PKGS
}

function install_ubuntu() {
    echo "Installing for Ubuntu-${OS_VER}..."

    install_ubuntu_common
    if [ "$OS_VER" = "20.04" ]; then
        install_ubuntu_20_04
    elif [ "$OS_VER" = "22.04" ]; then
        install_ubuntu_22_04
    fi

    install_zsh

    rm_symlinks
    ln_symlinks
}
################################################################################

echo "#########################################################################"
echo "Leo's dotfiles install script"
echo "#########################################################################"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    OS_VER=$VERSION_ID
else
    # Fall back to uname, e.g. "Linux <version>", also works for BSD, etc.
    OS=$(uname -s)
    OS_VER=$(lsb_release -r | cut -f2)
fi

if grep -qi microsoft /proc/version; then
    WSL=1
else
    WSL=0
fi

TEST_MODE=0
LINK_ONLY=0
WORK_INSTALL=0
# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--test)
        TEST_MODE=1
        shift # get next arg
        ;;
        -l|--linkonly)
        LINK_ONLY=1
        shift # get next arg
        ;;
        -w|--work)
        WORK_INSTALL=1
        shift # get next arg
        ;;
        -h|--help)
        print_usage
        exit
        ;;
        *)
        shift # get next arg
        ;;
    esac
done

if [ $TEST_MODE = 1 ] || [ $LINK_ONLY = 1 ]; then
    RM_RF="echo test: ${RM_RF}"
    LN_SF="echo test: ${LN_SF}"
    GIT_SUBMODULE_INIT="echo test: ${GIT_SUBMODULE_INIT}"
    UBUNTU_UPDATE="echo test: ${UBUNTU_UPDATE}"
    UBUNTU_INSTALL="echo test: ${UBUNTU_INSTALL}"
    ZSH_INSTALL="echo test: ${ZSH_INSTALL}"
    CHSH_ZSH="echo test: ${CHSH_ZSH}"
    X_ON=""
    X_OFF=""
    CHMOD="echo test: ${CHMOD}"
    CP="echo test: ${CP}"
    MKDIR="echo test: ${MKDIR}"
fi

if [ $LINK_ONLY = 1 ]; then
    RM_RF="sudo rm -rf"
    LN_SF="ln -sf"
fi

# TODO: Drop submodules, just copy stuff
echo "Initializing git submodules:"
$GIT_SUBMODULE_INIT
echo "-------------------------------------------------------------------------"

case "$OS" in
    "Ubuntu")
        install_ubuntu
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

if [ "$WORK_INSTALL" = 1 ]; then
    install_work
fi

if [ "$WSL" = 1 ]; then
    install_for_wsl
fi

echo "#########################################################################"
echo "Installation completed"
echo "#########################################################################"
