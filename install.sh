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
UNTAR="tar xvf"
ONEDRIVE_PATH="/mnt/c/Users/13lbise/OneDrive - Sonova"
KEYS_SSH_DIR="$ONEDRIVE_PATH/.ssh"
KEYS_GPG_DIR="$ONEDRIVE_PATH/.gnupg"
COMMON_PACKAGES="zsh fzf ripgrep gzip tmux curl wget unzip tar npm python3 python3.12-venv"
UBUNTU_COMMON_PACKAGES="fd-find pinentry-tty build-essential gdb"
MAC_PACKAGES="fd gpg universal-ctags nvim"
NVIM_PLUGINS_MD5="6346ed3833ee02a75aba246bb9edb6af"

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
    if [ ! -d ~/.config ]; then
        $MKDIR ~/.config
    fi
    $LN_SF $DIR/nvim ~/.config/nvim
    $LN_SF $DIR/ruff ~/.config/ruff
    $LN_SF $DIR/gpg/gpg.conf ~/.gnupg/gpg.conf
    $LN_SF $DIR/gpg/gpg-agent.conf ~/.gnupg/gpg-agent.conf
    $X_OFF
}

function install_nodejs() {
    echo "-------------------------------------------------------------------------"
    echo "Installing nodejs.."

    if ! command -v node &> /dev/null; then
        UPDATE=1
    else
        # Check version, need >= 14.14
        VERSION=$(node -v)
        # Format v18.14.0
        if [[ $VERSION =~ v([0-9]+).([0-9]+) ]]; then
            MAJOR=${BASH_REMATCH[1]}
            MINOR=${BASH_REMATCH[2]}
            if [ "$MAJOR" -lt "14" ]; then
                UPDATE=1
            elif [ "$MAJOR" -eq "14" ] && [ "$MINOR" -lt "14" ]; then
                UPDATE=1
            fi
        fi
    fi

    if [ "$UPDATE" = "1" ]; then
        if [ "$WORK_INSTALL" = 1 ]; then
            # Taken from https://github.com/vercel/install-node/blob/master/install.sh
            VERSION="v18.17.0"
            INSTALL_DIR="/usr/local/"
            APP_DIR="$DIR/archives"
            sudo tar -xJvf $APP_DIR/node-$VERSION-linux-x64.tar.xz  \
                --exclude CHANGELOG.md                              \
                --exclude LICENSE                                   \
                --exclude README.md                                 \
                --strip-components 1                                \
                -C $INSTALL_DIR
            echo "Installed node in $INSTALL_DIR"
        else
            # --force prevents prompt to ask to install nodejs
            curl -sL install-node.vercel.app/lts | sudo bash -s -- --force
        fi
    else
        echo "nodejs $VERSION already installed"
    fi
}

function install_neovim() {
    NVIM_VERSION="0.9.5"
    NVIM_VER_REGEX="^NVIM v([0-9]+.[0-9]+.[0-9]+)"
    NVIM_OUT="$DIR/archives"
    NVIM_SRC="$NVIM_OUT/nvim-linux64"
    NVIM_DST="/usr"

    echo "-------------------------------------------------------------------------"
    if [ -f "/usr/bin/nvim" ]; then
        NVIM_CUR_VER=$(nvim -v)
        if [[ $NVIM_CUR_VER =~ $NVIM_VER_REGEX ]]; then
            # Match
            NVIM_CUR_VER=${BASH_REMATCH[1]}
            if [[ $NVIM_CUR_VER == $NVIM_VERSION ]]; then
                echo "nvim $NVIM_CUR_VER already installed!"
                return
            fi
        else
            # No match
            echo "Cannot determine nvim version, re-installing"
        fi
    fi

    echo "Installing neovim v$NVIM_VERSION..."
    $UNTAR $NVIM_OUT/nvim-linux64-${NVIM_VERSION}.tar.gz -C $NVIM_OUT
    sudo $CP -r $NVIM_SRC/* $NVIM_DST
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
    if [ "$WORK_INSTALL" = 1 ]; then
        OHZSH_REPO="https://ch03git.phonak.com/13lbise/leo_ohmyzsh"
        curl -kSL "$OHZSH_REPO/raw/branch/master/tools/install.sh" -o "$HOME/install_ohmyzsh.sh"
        $CHMOD +x "$HOME/install_ohmyzsh.sh"
        REMOTE=$OHZSH_REPO $HOME/install_ohmyzsh.sh --unattended
        $RM_RF "$HOME/install_ohmyzsh.sh"
    else
        sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
    fi
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
    echo "Installing SSH keys..."

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

    # Delete keys if they are not on one drive
    if [ "$KEYS_SSH_DIR" != "$ONEDRIVE_PATH/.ssh" ]; then
        $RM_RF "$KEYS_SSH_DIR/$SSH_NAME.pub"
        $RM_RF "$KEYS_SSH_DIR/$SSH_NAME"
    fi

    if [ "$KEYS_GPG_DIR" != "$ONEDRIVE_PATH/.gnupg" ]; then
        $RM_RF "$KEYS_GPG_DIR/$GPG_PUB_NAME"
        $RM_RF "$KEYS_GPG_DIR/$GPG_PRIV_NAME"
    fi
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
    if [ "$WORK_INSTALL" = 1 ]; then
        PKGS="$PKGS git-lfs"
    fi

    if [ "$OS_VER" = "20.04" ]; then
        PKGS="$PKGS ctags"
    elif [ "$OS_VER" = "22.04" ]; then
        PKGS="$PKGS universal-ctags"
    fi

    $UBUNTU_UPDATE
    $UBUNTU_INSTALL $PKGS

    install_neovim
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
