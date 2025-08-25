#!/usr/bin/env bash
# SSH and GPG key management functions

# Source common variables and functions
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

install_ssh_keys() {
    print_section "Installing SSH keys"

    if [ -z "$1" ]; then
        echo "You must provide the key name: $0 <ssh_key_name>"
        return 1
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
        return 1
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

install_gpg_keys() {
    print_section "Installing GPG keys"

    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "You must provide the key names: $0 <private_key> <public_key>"
        return 1
    fi

    GPG_PRIV_NAME="$1"
    GPG_PUB_NAME="$2"
    GPG_SRC_PATH="$KEYS_GPG_DIR"
    GPG_DST_PATH="$HOME/.gnupg"
    GPG_CONF_NAME="gpg.conf"
    GPG_SRC_PRIV="$GPG_SRC_PATH/$GPG_PRIV_NAME"
    GPG_SRC_PUB="$GPG_SRC_PATH/$GPG_PUB_NAME"
    GPG_SRC_CONF="$DOTFILES_DIR/gpg/$GPG_CONF_NAME"
    GPG_DST_PRIV="$GPG_DST_PATH/$GPG_PRIV_NAME"
    GPG_DST_PUB="$GPG_DST_PATH/$GPG_PUB_NAME"
    GPG_DST_CONF="$GPG_DST_PATH/$GPG_CONF_NAME"

    if [ ! -f "$GPG_SRC_PRIV" ] || [ ! -f "$GPG_SRC_PUB" ]; then
        echo "Cannot find GPG keys: $GPG_SRC_PRIV $GPG_SRC_PUB. Skipping..."
        return 1
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

    if gpg --list-secret-keys --keyid-format=long "$GPG_KEYID" | grep -q 'unknown'; then
        echo "Invalid gpg key trust level..."
        # Increase trust level
        cat "$DOTFILES_DIR/gpg/gpg_ownertrust.txt" | gpg --import-ownertrust
    fi
}

install_keys() {
    print_section "Installing keys based on user"
    
    if [ "$USER" = "13lbise" ]; then
        SSH_NAME="id_ed25519_git_sonova"
        GPG_PRIV_NAME="sonova_private.pgp"
        GPG_PUB_NAME="sonova_public.pgp"
    elif [ "$USER" = "leo" ]; then
        SSH_NAME="id_rsa"
        GPG_PRIV_NAME="private.pgp"
        GPG_PUB_NAME="public.pgp"
    else
        echo "Cannot determine key names for user: $USER"
        return 1
    fi

    install_ssh_keys "$SSH_NAME"
    install_gpg_keys "$GPG_PRIV_NAME" "$GPG_PUB_NAME"
}

# Allow this script to be run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    apply_test_mode
    install_keys
fi