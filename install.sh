#!/usr/bin/env bash
# Install dotfiles and setup system
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

################################################################################
# Common
################################################################################

RM_RF="sudo rm -rf"
LN_SF="ln -sf"
ZSH_INSTALL="install_ohmyzsh"
SH_C="sh -c"
CHSH_S="chsh -s"
X_ON="set -x"
X_OFF="set +x"
CHMOD="chmod"
CP="cp"
MV="mv"
MKDIR="mkdir"
ONEDRIVE_PATH="/mnt/c/Users/13lbise/OneDrive - Sonova"
KEYS_SSH_DIR="$ONEDRIVE_PATH/.ssh"
KEYS_GPG_DIR="$ONEDRIVE_PATH/.gnupg"

function print_usage() {
    USAGE="$(basename "$0") [-h|--help] [-l|--linkonly] [-t|--test] -- Install dotfiles

        where:
            -h|--help: Print this help
            -l|--linkonly: Only perform symlink setup. Do not install packages.
            -w|--work: Perform installation for work.
            -k|--keys: Folder to find keys to install
            -s|--wslonly: Perform WSL installation only.
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
    $RM_RF ~/.bashrc
    $RM_RF ~/.ctags
    $RM_RF ~/.scripts
    $RM_RF ~/.gdbinit
    $RM_RF ~/.gdbinit.d
    $RM_RF ~/.tmux.conf
	$RM_RF ~/.tmux
    # For pinentry configuration (passphrase enter in command line)
    if [ ! -d ~/.gnupg ]; then
        $MKDIR ~/.gnupg
        $CHMOD 700 ~/.gnupg
    fi
    $RM_RF ~/.gnupg/gpg.conf
    $RM_RF ~/.gnupg/gpg-agent.conf
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
    $LN_SF $DIR/.bashrc ~/.bashrc
    $LN_SF $DIR/.ctags ~/.ctags
    $LN_SF $DIR/scripts ~/.scripts
    $LN_SF $DIR/.gdbinit ~/.gdbinit
    $LN_SF $DIR/.gdbinit.d ~/.gdbinit.d
    $LN_SF $DIR/.tmux.conf ~/.tmux.conf
    $LN_SF $DIR/tmux ~/.tmux
    # For pinentry configuration (passphrase enter in command line)
    $LN_SF $DIR/gpg/gpg.conf ~/.gnupg/gpg.conf
    $LN_SF $DIR/gpg/gpg-agent.conf ~/.gnupg/gpg-agent.conf
    $X_OFF
}

function install_common() {
    echo "-------------------------------------------------------------------------"
    echo "Installing common items..."

    install_zsh

	# Setup symlinks
    rm_symlinks
    ln_symlinks
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

    if [ "$WSL" = 0 ] && [ "$WORK_INSTALL" = 1 ]; then
        echo "Skipping changing default shell as we cannot do it ..."
        return
    fi

    # Change default shell to zsh
    if [[ "$SHELL" != *"zsh"* ]]; then
        $CHSH_S $(which zsh)
    fi
}

function install_keys_sonova() {
    echo "-------------------------------------------------------------------------"
    echo "Installing keys..."

    SSH_NAME="id_ed25519_git_sonova"
    SSH_SRC_PATH="$KEYS_SSH_DIR"
    SSH_DST_PATH="$HOME/.ssh"
    SSH_SRC_PRIV="$SSH_SRC_PATH/$SSH_NAME"
    SSH_SRC_PUB="$SSH_SRC_PATH/$SSH_NAME.pub"
    SSH_DST_PRIV="$SSH_DST_PATH/$SSH_NAME"
    SSH_DST_PUB="$SSH_DST_PATH/$SSH_NAME.pub"

    GPG_SRC_PATH="$KEYS_GPG_DIR"
    GPG_DST_PATH="$HOME/.gnupg"
    GPG_PRIV_NAME="sonova_private.pgp"
    GPG_PUB_NAME="sonova_public.pgp"
    GPG_CONF_NAME="gpg.conf"
    GPG_SRC_PRIV="$GPG_SRC_PATH/$GPG_PRIV_NAME"
    GPG_SRC_PUB="$GPG_SRC_PATH/$GPG_PUB_NAME"
    GPG_SRC_CONF="$DIR/gpg/$GPG_CONF_NAME"
    GPG_DST_PRIV="$GPG_DST_PATH/$GPG_PRIV_NAME"
    GPG_DST_PUB="$GPG_DST_PATH/$GPG_PUB_NAME"
    GPG_DST_CONF="$GPG_DST_PATH/$GPG_CONF_NAME"

    if [ ! -f "$SSH_SRC_PRIV" ] || [ ! -f "$SSH_SRC_PUB" ]; then
        echo "Cannot find SSH keys: $SSH_SRC_PRIV $SSH_SRC_PUB. Skipping..."
        return
    fi

    if [[ ! -d "$SSH_DST_PATH" ]]; then
        echo "Creating $SSH_DST_PATH"
		$MKDIR "$SSH_DST_PATH"
        $CHMOD 700 "$SSH_DST_PATH"
    fi

    if [ ! -f "$SSH_DST_PRIV" ] || [ ! -f "$SSH_DST_PUB" ]; then
        echo "Installing SSH keys: $SSH_SRC_PRIV -> $SSH_DST_PRIV; $SSH_SRC_PUB -> $SSH_DST_PUB"
	    $MV "$SSH_SRC_PRIV" "$SSH_DST_PATH"
	    $CHMOD 600 "$SSH_DST_PRIV"
	    $MV "$SSH_SRC_PUB" "$SSH_DST_PATH"
	    $CHMOD 644 "$SSH_DST_PUB"
    fi

    if [ ! -f "$GPG_SRC_PRIV" ] || [ ! -f "$GPG_SRC_PUB" ]; then
        echo "Cannot find GPG keys: $GPG_SRC_PRIV $GPG_SRC_PUB. Skipping..."
        return
    fi

    if [[ ! -d "$GPG_DST_PATH" ]]; then
        echo "Creating $GPG_DST_PATH"
		$MKDIR "$GPG_DST_PATH"
        $CHMOD 700 "$GPG_DST_PATH"
    fi

    if [ ! -f "$GPG_DST_PRIV" ] || [ ! -f "$GPG_DST_PRIV" ]; then
        echo "Installing GPG keys: $GPG_SRC_PRIV -> $GPG_DST_PRIV; $GPG_SRC_PUB -> $GPG_DST_PUB"
	    $MV "$GPG_SRC_PRIV" "$GPG_DST_PRIV"
	    $CHMOD 600 "$GPG_DST_PRIV"
	    $MV "$GPG_SRC_PUB" "$GPG_DST_PUB"
	    $CHMOD 644 "$GPG_DST_PUB"
    fi
}

function install_work() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

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
    PKGS="zsh fzf ripgrep silversearcher-ag"
    if [ "$WORK_INSTALL" = 1 ]; then
        PKGS="$PKGS git-lfs"
    fi

    $UBUNTU_UPDATE
    $UBUNTU_INSTALL $PKGS
}

function install_ubuntu() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    OS_VER=$VERSION_ID
    echo "Installing for Ubuntu-${OS_VER}..."

    install_ubuntu_common
    if [ "$OS_VER" = "20.04" ]; then
        install_ubuntu_20_04
    elif [ "$OS_VER" = "22.04" ]; then
        install_ubuntu_22_04
    fi

	install_common
}
################################################################################
# MacOs
################################################################################
MACOS_UPDATE="brew update"
MACOS_UPGRADE="brew upgrade"
MACOS_INSTALL="brew install"

function install_macos() {
    PKGS="zsh fzf gpg tmux"

    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    echo "Installing for MacOs..."
    $MACOS_UPDATE
    $MACOS_UPGRADE
    $MACOS_INSTALL $PKGS

	install_common
}
################################################################################
# Arch
################################################################################
ARCH_UPDATE="sudo pacman -Syu"
ARCH_INSTALL="sudo pacman -S --needed"

function install_arch_common() {
    PKGS="zsh fzf tmux"

    $ARCH_UPDATE
    $ARCH_INSTALL $PKGS
}

function install_arch() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    echo "Installing for Arch Linux..."
    install_arch_common

	install_common
}
################################################################################
#
echo "#########################################################################"
echo "Leo's dotfiles install script"
echo "#########################################################################"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
else
    OS=$(uname -s)
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

        -k|--keys)
        KEYS_SSH_DIR="$2"
        KEYS_GPG_DIR="$2"
        shift # get next arg
        shift # get next arg
        ;;
        -s|--wslonly)
        WSL_ONLY=1
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
    UBUNTU_UPDATE="echo test: ${UBUNTU_UPDATE}"
    UBUNTU_INSTALL="echo test: ${UBUNTU_INSTALL}"
    ZSH_INSTALL="echo test: ${ZSH_INSTALL}"
    CHSH_ZSH="echo test: ${CHSH_ZSH}"
    X_ON=""
    X_OFF=""
    CHMOD="echo test: ${CHMOD}"
    CP="echo test: ${CP}"
    MV="echo test: ${MV}"
    MKDIR="echo test: ${MKDIR}"
fi

if [ $LINK_ONLY = 1 ]; then
    RM_RF="sudo rm -rf"
    LN_SF="ln -sf"
fi

# Detect WSL
WSL=0
if [[ "$OS" == "Ubuntu" ]]; then
    if grep -qi microsoft /proc/version; then
        WSL=1
    fi
fi

case "$OS" in
    "Ubuntu")
    install_ubuntu
    ;;
    "Darwin")
	install_macos
	;;
    "Arch Linux")
    install_arch
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
