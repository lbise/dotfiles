#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing eza..."

if is_arch; then
    echo "Skipped on arch linux, done using yay"
    exit 0
fi

REPO="eza-community/eza"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
TAG=$(get_github_latest_tag "$REPO")

# eza does not publish macOS binaries in its GitHub releases.
if [[ "$OS" == "macos" ]]; then
    if ! command -v brew >/dev/null 2>&1; then
        echo "ERROR: eza does not provide macOS release binaries and Homebrew was not found" >&2
        exit 1
    fi

    if brew list --versions eza >/dev/null 2>&1; then
        echo "Upgrading eza via Homebrew..."
        brew upgrade eza
    else
        echo "Installing eza via Homebrew..."
        brew install eza
    fi
    exit 0
fi

case "$ARCH" in
    x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
    arm64)  TARGET="aarch64-unknown-linux-gnu" ;;
esac

TARBALL_URL="https://github.com/${REPO}/releases/download/${TAG}/eza_${TARGET}.tar.gz"

install_github_release "eza" "$REPO" "$TARBALL_URL" "$TAG"
