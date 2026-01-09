#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing fzf..."

REPO="junegunn/fzf"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
TAG=$(get_github_latest_tag "$REPO")
VERSION="${TAG#v}"

# Map to fzf's naming convention
case "$OS" in
    linux) FZF_OS="linux" ;;
    macos) FZF_OS="darwin" ;;
esac

case "$ARCH" in
    x86_64) FZF_ARCH="amd64" ;;
    arm64)  FZF_ARCH="arm64" ;;
esac

TARBALL_URL="https://github.com/${REPO}/releases/download/${TAG}/fzf-${VERSION}-${FZF_OS}_${FZF_ARCH}.tar.gz"

install_github_release "fzf" "$REPO" "$TARBALL_URL"
