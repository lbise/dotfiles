#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing nvim..."

if is_arch; then
    echo "Skipped on arch linux, done using yay"
    exit 0
fi

REPO="neovim/neovim"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
TAG=$(get_github_latest_tag "$REPO")

# Map to neovim's naming convention
# Neovim releases: nvim-linux-x86_64.tar.gz, nvim-linux-arm64.tar.gz, nvim-macos-x86_64.tar.gz, nvim-macos-arm64.tar.gz
case "$OS" in
    linux) NVIM_OS="linux" ;;
    macos) NVIM_OS="macos" ;;
esac

case "$ARCH" in
    x86_64) NVIM_ARCH="x86_64" ;;
    arm64)  NVIM_ARCH="arm64" ;;
esac

TARBALL_URL="https://github.com/${REPO}/releases/download/${TAG}/nvim-${NVIM_OS}-${NVIM_ARCH}.tar.gz"

install_github_release "nvim" "$REPO" "$TARBALL_URL" "$TAG" "nvim"
