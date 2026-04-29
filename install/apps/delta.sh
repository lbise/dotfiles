#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing delta..."

if is_arch; then
    echo "Skipped on arch linux, done using pacman"
    exit 0
fi

REPO="dandavison/delta"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
TAG=$(get_github_latest_tag "$REPO")

# Delta no longer publishes a macOS x86_64 tarball.
if [[ "$OS" == "macos" && "$ARCH" == "x86_64" ]]; then
    if ! command -v brew >/dev/null 2>&1; then
        echo "ERROR: delta does not provide a macOS x86_64 tarball and Homebrew was not found" >&2
        exit 1
    fi

    if brew list --versions git-delta >/dev/null 2>&1; then
        echo "Upgrading git-delta via Homebrew..."
        brew upgrade git-delta
    else
        echo "Installing git-delta via Homebrew..."
        brew install git-delta
    fi
    exit 0
fi

# Map to delta's naming convention
case "$OS" in
    linux)
        case "$ARCH" in
            x86_64) TARGET="x86_64-unknown-linux-musl" ;;
            arm64)  TARGET="aarch64-unknown-linux-gnu" ;;
            *)
                echo "Unsupported architecture for delta on linux: $ARCH" >&2
                exit 1
                ;;
        esac
        ;;
    macos)
        case "$ARCH" in
            arm64) TARGET="aarch64-apple-darwin" ;;
            *)
                echo "Unsupported architecture for delta on macos: $ARCH" >&2
                exit 1
                ;;
        esac
        ;;
    *)
        echo "Unsupported OS for delta: $OS" >&2
        exit 1
        ;;
esac

TARBALL_URL="https://github.com/${REPO}/releases/download/${TAG}/delta-${TAG}-${TARGET}.tar.gz"

install_github_release "delta" "$REPO" "$TARBALL_URL" "$TAG"
