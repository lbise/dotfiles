#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing herdr..."

# Temporary source until the required feature is merged upstream.
# REPO="herdrdev/herdr"
REPO="tahaalibra/herdr"
OS=$(get_os) || exit 1
ARCH=$(get_arch) || exit 1
# The fork publishes its builds as prereleases, which GitHub's /latest endpoint
# deliberately omits.
TAG=$(get_github_newest_release_tag "$REPO")

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
# Fork releases use non-version tags (for example, multi-remote-6), so the
# binary's --version output cannot tell which fork build was installed.
RELEASE_TAG_PATH="$INSTALL_DIR/.herdr-release-tag"

if [[ -x "$BINARY_PATH" ]]; then
    CURRENT_VERSION=$(normalize_version "$("$BINARY_PATH" --version 2>/dev/null || true)" || true)
    CURRENT_TAG=$(cat "$RELEASE_TAG_PATH" 2>/dev/null || true)
    if [[ "$CURRENT_TAG" == "$TAG" ]]; then
        echo "herdr is already up to date ($CURRENT_VERSION, $TAG)"
        exit 0
    fi

    echo "herdr ${CURRENT_VERSION:-unknown} is installed, upgrading to $TAG..."
else
    echo "Installing herdr $TAG..."
fi

BINARY_URL="https://github.com/${REPO}/releases/download/${TAG}/herdr-${OS}-${HERDR_ARCH}"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading from $BINARY_URL..."
curl -fsSL "$BINARY_URL" -o "$TMP_DIR/herdr"

mkdir -p "$INSTALL_DIR"
chmod +x "$TMP_DIR/herdr"
mv "$TMP_DIR/herdr" "$BINARY_PATH"
printf '%s\n' "$TAG" > "$RELEASE_TAG_PATH"

echo "herdr installed successfully to $BINARY_PATH"
