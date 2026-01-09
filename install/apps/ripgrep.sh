#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing ripgrep..."

if is_arch; then
    echo "Skipped on arch linux, done using yay"
    exit 0
fi

REPO="BurntSushi/ripgrep"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
TAG=$(get_github_latest_tag "$REPO")

# Map to ripgrep's naming convention
case "$OS" in
    linux)
        case "$ARCH" in
            x86_64) TARGET="x86_64-unknown-linux-musl" ;;
            arm64)  TARGET="aarch64-unknown-linux-gnu" ;;
        esac
        ;;
    macos)
        case "$ARCH" in
            x86_64) TARGET="x86_64-apple-darwin" ;;
            arm64)  TARGET="aarch64-apple-darwin" ;;
        esac
        ;;
esac

TARBALL_URL="https://github.com/${REPO}/releases/download/${TAG}/ripgrep-${TAG}-${TARGET}.tar.gz"

install_github_release "rg" "$REPO" "$TARBALL_URL" "rg"
