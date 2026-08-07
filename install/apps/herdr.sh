#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing herdr..."

REPO="herdrdev/herdr"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
TAG=$(get_github_latest_tag "$REPO")

if [[ -z "$TAG" ]]; then
    echo "ERROR: Could not determine the latest herdr release" >&2
    exit 1
fi

# Herdr uses aarch64 rather than arm64 in its release asset names.
case "$ARCH" in
    x86_64) HERDR_ARCH="x86_64" ;;
    arm64)  HERDR_ARCH="aarch64" ;;
esac

INSTALL_DIR="$HOME/.local/bin"
BINARY_PATH="$INSTALL_DIR/herdr"
LATEST_VERSION=$(normalize_version "$TAG")

if [[ -x "$BINARY_PATH" ]]; then
    CURRENT_VERSION=$(normalize_version "$("$BINARY_PATH" --version 2>/dev/null || true)" || true)
    if [[ "$CURRENT_VERSION" == "$LATEST_VERSION" ]]; then
        echo "herdr is already up to date ($CURRENT_VERSION)"
        exit 0
    fi

    echo "herdr ${CURRENT_VERSION:-unknown} is installed, upgrading to $LATEST_VERSION..."
else
    echo "Installing herdr $LATEST_VERSION..."
fi

BINARY_URL="https://github.com/${REPO}/releases/download/${TAG}/herdr-${OS}-${HERDR_ARCH}"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading from $BINARY_URL..."
curl -fsSL "$BINARY_URL" -o "$TMP_DIR/herdr"

mkdir -p "$INSTALL_DIR"
chmod +x "$TMP_DIR/herdr"
mv "$TMP_DIR/herdr" "$BINARY_PATH"

echo "herdr installed successfully to $BINARY_PATH"
