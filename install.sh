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
UNTAR="tar xf"
ONEDRIVE_PATH="/mnt/c/Users/13lbise/OneDrive - Sonova"
KEYS_SSH_DIR="$ONEDRIVE_PATH/.ssh"
KEYS_GPG_DIR="$ONEDRIVE_PATH/.gnupg"
COMMON_PACKAGES="zsh fzf ripgrep gzip tmux curl wget unzip tar npm pass"
UBUNTU_COMMON_PACKAGES="fd-find pinentry-tty build-essential gdb"
MAC_PACKAGES="fd gpg universal-ctags nvim"
NVIM_PLUGINS_MD5=`cat $DIR/archives/plugins.md5`
GPG_KEYID="ED0DFB79FF83B277"

function print_usage() {
    USAGE="$(basename "$0") [-h|--help] [-l|--linkonly] [-t|--test] -- Install dotfiles

        where:
            -h|--help: Print this help
            -l|--linkonly: Only perform symlink setup. Do not install packages.
            -w|--work: Perform installation for work.
            -k|--keys: Folder to find keys to install
            -s|--wslonly: Perform WSL installation only.
            -t|--test: Do not perfrom any operation just print
            -c|--copyvim: Copy VIM plugins (Used when no internet access available)"
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
    $RM_RF ~/.config/nvim
    $RM_RF ~/.config/ruff
    $RM_RF ~/.config/ghostty
    $RM_RF ~/.local/share/applications/ghostty.desktop
    if [ ! -d ~/.gnupg ]; then
        $MKDIR ~/.gnupg
        $CHMOD 700 ~/.gnupg
    fi
    $RM_RF ~/.gnupg/gpg.conf
    $RM_RF ~/.gnupg/gpg-agent.conf
    $RM_RF ~/.clang-format
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
    if [ ! -d ~/.config ]; then
        $MKDIR ~/.config
    fi
    $LN_SF $DIR/nvim ~/.config/nvim
    $LN_SF $DIR/ruff ~/.config/ruff
    $LN_SF $DIR/ghostty ~/.config/ghostty
    $LN_SF $DIR/gpg/gpg.conf ~/.gnupg/gpg.conf
    $LN_SF $DIR/gpg/gpg-agent.conf ~/.gnupg/gpg-agent.conf
    $LN_SF $DIR/.clang-format ~/.clang-format
    if [ -d "~/.local/share/applications/" ]; then
        $LN_SF $DIR/ghostty/ghostty.desktop ~/.local/share/applications/ghostty.desktop
    fi
    $X_OFF
}

function install_nodejs() {
    echo "-------------------------------------------------------------------------"
    NODE_VERSION="20.13.1"
    NODE_VER_REGEX="^v([0-9]+.[0-9]+.[0-9]+)"
    NODE_NAME="node-v$NODE_VERSION-linux-x64"
    NODE_OUT="$DIR/archives"
    NODE_SRC="$NODE_OUT/$NODE_NAME"
    NODE_DST="$HOME/.bin"
    NODE_BIN="$NODE_DST/$NODE_NAME/bin/node"

    if [ -f "$NODE_BIN" ]; then
        NODE_CUR_VER=$($NODE_BIN -v)
        if [[ $NODE_CUR_VER =~ $NODE_VER_REGEX ]]; then
            # Match
            NODE_CUR_VER=${BASH_REMATCH[1]}
            if [[ $NODE_CUR_VER == $NODE_VERSION ]]; then
                echo "node $NODE_CUR_VER already installed!"
                return
            fi
        else
            # No match
            echo "Cannot determine node version, re-installing"
        fi
    fi

    if [ -d "$NODE_SRC" ]; then
        echo "$NODE_SRC already exists! Delete it"
        exit
    fi

    echo "Installing nodejs v$NODE_VERSION..."
    $UNTAR $NODE_OUT/$NODE_NAME.tar.xz -C $NODE_OUT
    if [ ! -d "$NODE_DST" ]; then
        mkdir "$NODE_DST"
    fi

    $CP -r $NODE_SRC $NODE_DST
    $RM_RF $NODE_SRC
}

function install_gcm_home() {
    echo "-------------------------------------------------------------------------"
    echo "Installing git credential manager"
    GCM_ARCHIVE="$DIR/archives/gcm-linux_amd64.2.5.0.deb"

    if [ ! -f "/usr/local/bin/git-credential-manager" ]; then
        sudo dpkg -i $GCM_ARCHIVE
        if [ ! -d "$HOME/.password-store" ]; then
            pass init $GPG_KEYID
        fi
    fi
}

function install_neovim() {
    NVIM_VERSION="0.10.3"
    NVIM_VER_REGEX="^NVIM v([0-9]+.[0-9]+.[0-9]+)"
    NVIM_OUT="$DIR/archives"
    NVIM_SRC="$NVIM_OUT/nvim-linux64"
    NVIM_DST="$HOME/.bin"
    NVIM_BIN="$NVIM_DST/nvim-linux64/bin/nvim"

    echo "-------------------------------------------------------------------------"
    if [ -f $NVIM_BIN ]; then
        NVIM_CUR_VER=$($NVIM_BIN -v)
        if [[ $NVIM_CUR_VER =~ $NVIM_VER_REGEX ]]; then
            # Match
            NVIM_CUR_VER=${BASH_REMATCH[1]}
            if [[ $NVIM_CUR_VER == $NVIM_VERSION ]]; then
                echo "nvim $NVIM_CUR_VER already installed!"
                return
            else
                echo "nvim $NVIM_VERSION must be installed"
            fi
        else
            # No match
            echo "Cannot determine nvim version, re-installing"
        fi
    fi

    if [ -d "$NVIM_SRC" ]; then
        echo "$NVIM_SRC already exists! Delete it"
        exit
    fi

    echo "Installing neovim v$NVIM_VERSION..."
    # Prevent script stopping if there is no nvim process running
    killall nvim || true
    $UNTAR $NVIM_OUT/nvim-linux64-${NVIM_VERSION}.tar.gz -C $NVIM_OUT
    if [ ! -d "$NVIM_DST" ]; then
        mkdir "$NVIM_DST"
    fi

    $CP -r $NVIM_SRC $NVIM_DST
    $RM_RF $NVIM_SRC
}

function copy_neovim_plugins() {
    echo "Copying vim plugins..."

    PLUGIN_DST="$DIR/vim/pack/my-plugins/start"
    $MKDIR -p $PLUGIN_DST
    $CP -R $DIR/vim_plugins/* $PLUGIN_DST
    # nvim
    NVIM_PLUGINS_DST="$HOME/.local/share"
    #NVIM_PLUGINS_SRC="$DIR/archives/nvim_plugins_$NVIM_PLGINS_MD5.tar.gz"
    NVIM_PLUGINS_SRC="/mnt/ch03pool/murten_mirror/shannon/packages/bootstrap/nvim_plugins_$NVIM_PLUGINS_MD5.tar.gz"
    MD5_INSTALLED=""
    if [ ! -f "$NVIM_PLUGINS_SRC" ]; then
        echo "$NVIM_PLUGINS_SRC not found!"
        exit 1
    fi

    if [ -f "$NVIM_PLUGINS_DST/nvim_plugins_installed.txt" ]; then
        MD5_INSTALLED=$(cat $NVIM_PLUGINS_DST/nvim_plugins_installed.txt)
        echo "nvim plugins already installed md5=$MD5_INSTALLED"
    fi

    if [ "$NVIM_PLUGINS_MD5" != "$MD5_INSTALLED" ]; then
        echo "Copying nvim plugins to $NVIM_PLUGINS_DST (md5=$NVIM_PLUGINS_MD5)"
        if [ ! -d "$NVIM_PLUGINS_DST" ]; then
            $MKDIR -p $NVIM_PLUGINS_DST
        fi

        if [ -d "$NVIM_PLUGINS_DST/nvim" ]; then
            while true; do
                read -p "Do you wish to delete $NVIM_PLUGINS_DST/nvim? (y/n): " yn
                case $yn in
                    [Yy]* ) $RM_RF $NVIM_PLUGINS_DST/nvim; $RM_RF "$NVIM_PLUGINS_DST/nvim_plugins_installed.txt"; break;;
                    [Nn]* ) echo "Skipping nvim plugins copy"; return;;
                    * ) echo "Please answer yes or no.";;
                esac
            done
        fi

        $UNTAR "$NVIM_PLUGINS_SRC" -C "$NVIM_PLUGINS_DST"
        echo $NVIM_PLUGINS_MD5 >> "$NVIM_PLUGINS_DST/nvim_plugins_installed.txt"
        echo "Finished copying nvim plugins to $NVIM_PLUGINS_DST (md5=$NVIM_PLUGINS_MD5)"
    fi
}

function install_common() {
    echo "-------------------------------------------------------------------------"
    echo "Installing common items..."

    if [ "$COPY_VIM" = 1 ]; then
        copy_neovim_plugins
    fi

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
    if [ ! -d "$HOME/.oh-my-zsh" ]; then
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

function install_ssh_keys() {
    echo "-------------------------------------------------------------------------"
    echo "Installing SSH keys..."

    if [ -z "$1" ]; then
        echo "You must provide the key name: $0 <ssh_key_name>"
        return
    fi

    SSH_NAME="$1"

    SSH_SRC_PATH="$KEYS_SSH_DIR"
    SSH_DST_PATH="$HOME/.ssh"
    SSH_SRC_PRIV="$SSH_SRC_PATH/$SSH_NAME"
    SSH_SRC_PUB="$SSH_SRC_PATH/$SSH_NAME.pub"
    SSH_DST_PRIV="$SSH_DST_PATH/$SSH_NAME"
    SSH_DST_PUB="$SSH_DST_PATH/$SSH_NAME.pub"

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
        $CP "$SSH_SRC_PRIV" "$SSH_DST_PATH"
        $CHMOD 600 "$SSH_DST_PRIV"
        $CP "$SSH_SRC_PUB" "$SSH_DST_PATH"
        $CHMOD 644 "$SSH_DST_PUB"
    fi
}

function install_gpg_keys() {
    echo "-------------------------------------------------------------------------"
    echo "Installing GPG keys..."

    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "You must provide the key names: $0 <private_key> <public_key>"
        return
    fi

    GPG_PRIV_NAME="$1"
    GPG_PUB_NAME="$2"
    GPG_SRC_PATH="$KEYS_GPG_DIR"
    GPG_DST_PATH="$HOME/.gnupg"
    GPG_CONF_NAME="gpg.conf"
    GPG_SRC_PRIV="$GPG_SRC_PATH/$GPG_PRIV_NAME"
    GPG_SRC_PUB="$GPG_SRC_PATH/$GPG_PUB_NAME"
    GPG_SRC_CONF="$DIR/gpg/$GPG_CONF_NAME"
    GPG_DST_PRIV="$GPG_DST_PATH/$GPG_PRIV_NAME"
    GPG_DST_PUB="$GPG_DST_PATH/$GPG_PUB_NAME"
    GPG_DST_CONF="$GPG_DST_PATH/$GPG_CONF_NAME"

    if [ ! -f "$GPG_SRC_PRIV" ] || [ ! -f "$GPG_SRC_PUB" ]; then
        echo "Cannot find GPG keys: $GPG_SRC_PRIV $GPG_SRC_PUB. Skipping..."
        return
    fi

    if [[ ! -d "$GPG_DST_PATH" ]]; then
        echo "Creating $GPG_DST_PATH"
        $MKDIR "$GPG_DST_PATH"
        $CHMOD 700 "$GPG_DST_PATH"
    fi

    if [ ! -f "$GPG_DST_PRIV" ] || [ ! -f "$GPG_DST_PUB" ]; then
        echo "Installing GPG keys: $GPG_SRC_PRIV -> $GPG_DST_PRIV; $GPG_SRC_PUB -> $GPG_DST_PUB"
        $CP "$GPG_SRC_PRIV" "$GPG_DST_PRIV"
        $CHMOD 600 "$GPG_DST_PRIV"
        $CP "$GPG_SRC_PUB" "$GPG_DST_PUB"
        $CHMOD 644 "$GPG_DST_PUB"
        gpg --import "$GPG_DST_PRIV"
    fi

    if gpg --list-secret-keys --keyid-format=long $GPG_KEYID | grep -q 'unknown'; then
        echo "Invalid gpg key trust level..."
        # Increase trust level
        cat "$DIR/gpg/gpg_ownertrust.txt" | gpg --import-ownertrust
    fi
}

function install_keys() {
    if [ "$USER" = "13lbise" ]; then
        SSH_NAME="id_ed25519_git_sonova"
        GPG_PRIV_NAME="sonova_private.pgp"
        GPG_PUB_NAME="sonova_public.pgp"
    elif [ "$USER" = "leo" ]; then
        SSH_NAME="id_rsa"
        GPG_PRIV_NAME="private.pgp"
        GPG_PUB_NAME="public.pgp"
    else
        echo "Cannot determine key names"
        return
    fi

    install_ssh_keys $SSH_NAME
    install_gpg_keys $GPG_PRIV_NAME $GPG_PUB_NAME
}

function install_work() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    echo "Work specific install..."
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

function install_ubuntu() {
    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    OS_VER=$VERSION_ID
    echo "Installing for Ubuntu-${OS_VER}..."

    PKGS="$COMMON_PACKAGES $UBUNTU_COMMON_PACKAGES"

    if [ "$OS_VER" = "20.04" ]; then
        PKGS="$PKGS ctags"
    elif [ "$OS_VER" = "22.04" ]; then
        PKGS="$PKGS universal-ctags"
    elif [ "$OS_VER" = "24.04" ]; then
        PKGS="$PKGS python3.12-venv"
    fi

    $UBUNTU_UPDATE

    echo "> Installing following packages: $PKGS"
    $UBUNTU_INSTALL $PKGS

    if [ "$WORK_INSTALL" = 0 ]; then
        install_gcm_home
    fi

    install_neovim
    # Required by pyright
    install_nodejs
    install_common
}
################################################################################
# MacOs
################################################################################
MACOS_UPDATE="brew update -v"
MACOS_UPGRADE="brew upgrade -v"
MACOS_INSTALL="brew install"

function install_macos() {
    PKGS="$COMMON_PACKAGES $MAC_PACKAGES"

    if [ "$WSL_ONLY" = 1 ]; then
        return
    fi

    echo "Installing for MacOs..."
    $MACOS_UPDATE
    $MACOS_UPGRADE
    $MACOS_INSTALL $PKGS


    # Install fonts
    brew tap homebrew/cask-fonts
    $MACOS_INSTALL font-jetbrains-mono-nerd-font

    install_common
}
################################################################################
# Arch
################################################################################
ARCH_UPDATE="sudo pacman -Syu"
ARCH_INSTALL="sudo pacman -S --needed"

function install_arch_common() {
    PKGS="$COMMON_PACKAGES ctags"

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
COPY_VIM=0
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
        -c|--copyvim)
        COPY_VIM=1
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
    UNTAR="echo test: ${UNTAR}"
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

install_keys

if [ "$WORK_INSTALL" = 1 ]; then
    install_work
fi

if [ "$WSL" = 1 ]; then
    install_for_wsl
fi

echo "#########################################################################"
echo "Installation completed"
echo "#########################################################################"
