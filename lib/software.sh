#!/usr/bin/env bash
# Individual software installation functions

# Source common variables and functions
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

install_nodejs() {
    print_section "Installing Node.js"
    NODE_VERSION="20.13.1"
    NODE_VER_REGEX="^v([0-9]+.[0-9]+.[0-9]+)"
    NODE_NAME="node-v$NODE_VERSION-linux-x64"
    NODE_OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && realpath ../archives)"
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
        exit 1
    fi

    echo "Installing nodejs v$NODE_VERSION..."
    $UNTAR "$NODE_OUT/$NODE_NAME.tar.xz" -C "$NODE_OUT"
    if [ ! -d "$NODE_DST" ]; then
        mkdir "$NODE_DST"
    fi

    $CP -r "$NODE_SRC" "$NODE_DST"
    $RM_RF "$NODE_SRC"
}

install_gcm_home() {
    print_section "Installing git credential manager"
    GCM_ARCHIVE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && realpath ../archives)/gcm-linux_amd64.2.5.0.deb"

    if [ ! -f "/usr/local/bin/git-credential-manager" ]; then
        sudo dpkg -i "$GCM_ARCHIVE"
        if [ ! -d "$HOME/.password-store" ]; then
            pass init "$GPG_KEYID"
        fi
    fi
}

install_git_delta() {
    print_section "Installing git delta"
    DELTA_VERSION="0.18.2"
    DELTA_ARCHIVE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && realpath ../archives)/git-delta_${DELTA_VERSION}_amd64.deb"
    DELTA_URL="https://github.com/dandavison/delta/releases/download/${DELTA_VERSION}/git-delta_${DELTA_VERSION}_amd64.deb"

    if ! which delta >/dev/null 2>&1; then
        echo "Installing git delta v$DELTA_VERSION..."

        # Download if archive doesn't exist
        if [ ! -f "$DELTA_ARCHIVE" ]; then
            echo "Downloading git delta from $DELTA_URL..."
            curl -L -o "$DELTA_ARCHIVE" "$DELTA_URL"
        fi

        sudo dpkg -i "$DELTA_ARCHIVE"
    else
        echo "git delta already installed!"
    fi
}

install_neovim() {
    # Source config utilities
    source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

    # Load configuration from software.yml
    NVIM_VERSION=$(get_software_config "neovim" "version")
    NVIM_PLATFORM=$(get_software_config "neovim" "platform_template")
    NVIM_ARCHIVE_TEMPLATE=$(get_software_config "neovim" "archive_template")
    NVIM_ARCHIVE_EXT=$(get_software_config "neovim" "archive_extension")
    NVIM_INSTALL_PATH=$(get_software_config "neovim" "install_path")
    NVIM_BINARY_PATH=$(get_software_config "neovim" "binary_path")
    NVIM_SOURCE_DIR=$(get_software_config "neovim" "source_dir")

    # Extract version regex from config (nested under version_check)
    NVIM_VER_REGEX=$(awk '
        /^  neovim:/ { in_nvim = 1; next }
        in_nvim && /^  [a-z]/ { in_nvim = 0 }
        in_nvim && /^    version_check:/ { in_check = 1; next }
        in_check && /^    [a-z]/ { in_check = 0 }
        in_check && /^      regex:/ {
            gsub(/^      regex: *"/, "")
            gsub(/"$/, "")
            gsub(/\\\\/, "\\")
            print
            exit
        }
    ' "$CONFIG_DIR/software.yml")

    # Build paths using config values
    NVIM_OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && realpath ../$NVIM_SOURCE_DIR)"
    NVIM_DIR="$NVIM_PLATFORM"
    NVIM_SRC="$NVIM_OUT/$NVIM_DIR"
    NVIM_DST="${NVIM_INSTALL_PATH//\$HOME/$HOME}"
    NVIM_BIN="$NVIM_DST/$NVIM_DIR/$NVIM_BINARY_PATH"
    NVIM_ARCHIVE="$NVIM_OUT/${NVIM_ARCHIVE_TEMPLATE//\{version\}/$NVIM_VERSION}${NVIM_ARCHIVE_EXT}"

    # Verify regex was extracted
    if [ -z "$NVIM_VER_REGEX" ]; then
        echo "Error: Failed to extract version regex from config" >&2
        exit 1
    fi

    print_section "Installing Neovim"
    if [ -f "$NVIM_BIN" ]; then
        NVIM_CUR_VER=$($NVIM_BIN -v | head -1)
        if [[ $NVIM_CUR_VER =~ $NVIM_VER_REGEX ]]; then
            # Match - extract version from capture group
            if [ -n "${BASH_REMATCH[1]:-}" ]; then
                NVIM_CUR_VER=${BASH_REMATCH[1]}
                if [[ $NVIM_CUR_VER == $NVIM_VERSION ]]; then
                    echo "nvim $NVIM_CUR_VER already installed!"
                    return
                else
                    echo "nvim $NVIM_VERSION must be installed"
                fi
            else
                echo "Cannot extract nvim version, re-installing"
            fi
        else
            # No match
            echo "Cannot determine nvim version, re-installing"
        fi
    fi

    if [ -d "$NVIM_SRC" ]; then
        echo "$NVIM_SRC already exists! Delete it"
        exit 1
    fi

    echo "Installing neovim v$NVIM_VERSION from $NVIM_ARCHIVE..."
    # Prevent script stopping if there is no nvim process running
    killall nvim || true
    $UNTAR "$NVIM_ARCHIVE" -C "$NVIM_OUT"
    if [ ! -d "$NVIM_DST" ]; then
        mkdir "$NVIM_DST"
    fi

    $CP -r "$NVIM_SRC" "$NVIM_DST"
    $RM_RF "$NVIM_SRC"
}

copy_neovim_plugins() {
    echo "Copying vim plugins..."

    PLUGIN_DST="$DOTFILES_DIR/vim/pack/my-plugins/start"
    $MKDIR -p "$PLUGIN_DST"
    $CP -R "$DOTFILES_DIR/vim_plugins/"* "$PLUGIN_DST"

    # nvim
    NVIM_PLUGINS_DST="$HOME/.local/share"
    NVIM_PLUGINS_SRC="/mnt/ch03pool/murten_mirror/shannon/packages/bootstrap/nvim_plugins_$NVIM_PLUGINS_MD5.tar.gz"
    MD5_INSTALLED=""

    if [ ! -f "$NVIM_PLUGINS_SRC" ]; then
        echo "$NVIM_PLUGINS_SRC not found!"
        exit 1
    fi

    if [ -f "$NVIM_PLUGINS_DST/nvim_plugins_installed.txt" ]; then
        MD5_INSTALLED=$(cat "$NVIM_PLUGINS_DST/nvim_plugins_installed.txt")
        echo "nvim plugins already installed md5=$MD5_INSTALLED"
    fi

    if [ "$NVIM_PLUGINS_MD5" != "$MD5_INSTALLED" ]; then
        echo "Copying nvim plugins to $NVIM_PLUGINS_DST (md5=$NVIM_PLUGINS_MD5)"
        if [ ! -d "$NVIM_PLUGINS_DST" ]; then
            $MKDIR -p "$NVIM_PLUGINS_DST"
        fi

        if [ -d "$NVIM_PLUGINS_DST/nvim" ]; then
            while true; do
                read -p "Do you wish to delete $NVIM_PLUGINS_DST/nvim? (y/n): " yn
                case $yn in
                    [Yy]* ) $RM_RF "$NVIM_PLUGINS_DST/nvim"; $RM_RF "$NVIM_PLUGINS_DST/nvim_plugins_installed.txt"; break;;
                    [Nn]* ) echo "Skipping nvim plugins copy"; return;;
                    * ) echo "Please answer yes or no.";;
                esac
            done
        fi

        $UNTAR "$NVIM_PLUGINS_SRC" -C "$NVIM_PLUGINS_DST"
        echo "$NVIM_PLUGINS_MD5" >> "$NVIM_PLUGINS_DST/nvim_plugins_installed.txt"
        echo "Finished copying nvim plugins to $NVIM_PLUGINS_DST (md5=$NVIM_PLUGINS_MD5)"
    fi
}

install_ohmyzsh() {
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
}

install_zsh() {
    print_section "Installing zsh"
    if [ ! -d "$HOME/.oh-my-zsh" ]; then
        install_ohmyzsh
    fi

    if [ "$WSL" = 0 ] && [ "$WORK_INSTALL" = 1 ]; then
        echo "Skipping changing default shell as we cannot do it ..."
        return
    fi

    # Change default shell to zsh
    if [[ "$SHELL" != *"zsh"* ]]; then
        $CHSH_S "$(which zsh)"
    fi
}

# Install all software components
install_software() {
    if [ "$COPY_VIM" = 1 ]; then
        copy_neovim_plugins
    fi

    install_zsh

    # Only install these on non-WSL systems or when not WSL_ONLY
    if [ "$WSL_ONLY" != 1 ]; then
        install_neovim
        install_nodejs  # Required by pyright
        install_git_delta

        # Only install GCM for non-work installations
        if [ "$WORK_INSTALL" = 0 ]; then
            install_gcm_home
        fi
    fi
}

# Allow this script to be run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    apply_test_mode
    install_software
fi
