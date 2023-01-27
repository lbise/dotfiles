#!/bin/env bash
GITREPO="$HOME/gitrepo"
DOTFILES="$GITREPO/dotfiles"
DOTFILES_REPO="https://github.com/lbise/dotfiles.git"
ANDROMEDA="$HOME/andromeda"
ANDROMEDA_REPO="https://ch03git.phonak.com/andromeda/top.git"

if [[ -n "$IS_WSL" || -n "$WSL_DISTRO_NAME" ]]; then
    echo "Running WSL"
    WSL=1
else
    echo "Running native Linux"
    WSL=0
fi

if [ ! -d "$GITREPO" ]; then
    mkdir "$GITREPO"
    cd $GITREPO
fi

if [ ! -d "$DOTFILES" ]; then
    git clone $DOTFILES_REPO
    cd $DOTFILES

    if [ "$USER" = "13lbise" ]; then
        WORK="-w"
        if [ "$WSL" = 0 ]; then
            read -p "Run push_keys.sh from another machine and press a key"
            KEYS="-k $HOME"
        fi
    fi

    echo "Installing environment... work=$WORK keys=$KEYS"
    ./install.sh $WORK $KEYS
fi

if [ "$USER" = "13lbise" ] && [ ! -d "$ANDROMEDA" ]; then
    cd $HOME
    git clone $ANDROMEDA_REPO andromeda
    cd andromeda
    source sourceme
    read -p "What env do you want to extract? (Enter for default, none for none):" env
    if [ "$env" = "" ]; then
        env="to4"
    fi

    if [ "$env" != "none" ]; then
        python3 $HOME/andromeda/swcmp.py extract $env
    fi
fi
