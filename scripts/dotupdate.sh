#!/usr/bin/env bash
WLS=0
if grep -q "WSL" /proc/version; then
    WSL=1
    echo "WSL detected"
fi

if [ "$USER" = "13lbise" ]; then
    DOT_PATH="$HOME/gitrepo/leo_dotfiles"
    DOT_FLAGS="-w -c"
    if [ "$WSL" = 0 ]; then
        DOT_FLAGS="$DOT_FLAGS -c"
        echo "WSL detected"
    fi
else
    DOT_PATH="$HOME/gitrepo/dotfiles"
    DOT_FLAGS=""
fi

if [ ! -d "$DOT_PATH" ]; then
    echo "$DOT_PATH does not exist"
    exit 1
fi

cd $DOT_PATH

echo "> checking dotfiles status..."

# Check if repo is out of date
git remote update>/dev/null
UPSTREAM=${1:-'@{u}'}
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse "$UPSTREAM")
BASE=$(git merge-base @ "$UPSTREAM")
if [ $LOCAL = $REMOTE ]; then
    echo "> dotfiles up-to-date"
elif [ $LOCAL = $BASE ]; then
    echo "> dotfiles need to be updated"
    git pull
    $DOT_PATH/install.sh $DOT_FLAGS
elif [ $REMOTE = $BASE ]; then
    echo "> ***** dotfiles contain unpushed changes *****"
else
    echo "> ***** dotfiles diverged from upstream *****"
fi
