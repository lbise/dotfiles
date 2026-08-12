#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing fd..."

if is_arch; then
    echo "Skipped on arch linux, done using yay"
    exit 0
fi

REPO="sharkdp/fd"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
TAG=$(get_github_latest_tag "$REPO")

# fd no longer publishes a macOS x86_64 tarball.
if [[ "$OS" == "macos" && "$ARCH" == "x86_64" ]]; then
    if ! command -v brew >/dev/null 2>&1; then
        echo "ERROR: fd does not provide a macOS x86_64 tarball and Homebrew was not found" >&2
        exit 1
    fi

    if brew list --versions fd >/dev/null 2>&1; then
        echo "Upgrading fd via Homebrew..."
        brew upgrade fd
    else
        echo "Installing fd via Homebrew..."
        brew install fd
    fi
    exit 0
fi

# Map to fd's naming convention
case "$OS" in
    linux)
        case "$ARCH" in
            x86_64) TARGET="x86_64-unknown-linux-musl" ;;
            arm64)  TARGET="aarch64-unknown-linux-gnu" ;;
        esac
        ;;
    macos)
        case "$ARCH" in
            arm64) TARGET="aarch64-apple-darwin" ;;
        esac
        ;;
esac

TARBALL_URL="https://github.com/${REPO}/releases/download/${TAG}/fd-${TAG}-${TARGET}.tar.gz"

install_github_release "fd" "$REPO" "$TARBALL_URL" "$TAG"
