#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing tmux..."

if is_arch; then
    echo "Skipped on arch linux, done using yay"
    exit 0
fi

REPO="tmux/tmux-builds"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
TAG=$(get_github_latest_tag "$REPO")
VERSION="${TAG#v}"  # Remove 'v' prefix for filename

TARBALL_URL="https://github.com/${REPO}/releases/download/${TAG}/tmux-${VERSION}-${OS}-${ARCH}.tar.gz"

install_github_release "tmux" "$REPO" "$TARBALL_URL" "$TAG"
