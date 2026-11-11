#!/usr/bin/env bash
# Copy the SSH config to Windows for Windows apps such as the Herdr GUI.
# Windows OpenSSH rejects Include of WSL files ("Bad owner or permissions"),
# so the files are copied instead of linked.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DOTFILES_DIR=$(cd -- "$SCRIPT_DIR/../.." && pwd)
source "$DOTFILES_DIR/install/helpers.sh"

if [[ -z "${WIN_SSH_DIR:-}" ]]; then
    if ! is_wsl || ! command -v cmd.exe >/dev/null; then
        echo "Skipped Windows SSH config outside WSL"
        exit 0
    fi
    win_home=$(cd /mnt/c && cmd.exe /c 'echo %USERPROFILE%' | tr -d '\r')
    WIN_SSH_DIR="$(wslpath "$win_home")/.ssh"
fi

header="# Generated from leo_dotfiles by install/apply.d/20-windows-ssh.sh. Edit dot/.ssh/config there."
config="$WIN_SSH_DIR/config"
mkdir -p "$WIN_SSH_DIR"

# Keep a hand-written Windows config instead of silently overwriting it.
if [[ -f "$config" ]] && [[ "$(head -n1 "$config")" != "$header" ]]; then
    backup="$config.bak.$(date +%Y%m%d%H%M%S)"
    cp "$config" "$backup"
    echo "Backed up existing Windows SSH config to $backup"
fi

cp "$DOTFILES_DIR/scripts/ssh_phc_hosts.conf" "$WIN_SSH_DIR/ssh_phc_hosts.conf"
{
    echo "$header"
    # ~/.scripts does not exist on Windows; ~ there is %USERPROFILE%.
    sed 's#^Include ~/.scripts/ssh_phc_hosts.conf$#Include ~/.ssh/ssh_phc_hosts.conf#' \
        "$DOTFILES_DIR/dot/.ssh/config"
} > "$config"
echo "Windows SSH config updated in $WIN_SSH_DIR"
