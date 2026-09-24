#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing win32yank..."

# Neovim uses win32yank.exe for the Windows clipboard in WSL; see docs/clipboard.md.
if ! is_wsl; then
    echo "Skipped outside WSL"
    exit 0
fi

REPO="equalsraf/win32yank"
INSTALL_DIR="$HOME/.local/bin"
BINARY="$INSTALL_DIR/win32yank.exe"

case "$(get_arch)" in
    x86_64) ASSET="win32yank-x64.zip" ;;
    *)
        echo "No win32yank release for $(uname -m)" >&2
        exit 1
        ;;
esac

TAG=$(get_github_latest_tag "$REPO")
if [[ -z "$TAG" ]]; then
    if [[ -x "$BINARY" ]]; then
        echo "Could not query the latest release; keeping the installed win32yank"
        exit 0
    fi
    echo "Could not query the latest win32yank release" >&2
    exit 1
fi
LATEST_VERSION=$(normalize_version "$TAG")

if [[ -x "$BINARY" ]]; then
    CURRENT_VERSION=$(normalize_version "$("$BINARY" --version 2>/dev/null || true)" || true)
    if [[ "$CURRENT_VERSION" == "$LATEST_VERSION" ]]; then
        echo "win32yank is already up to date ($CURRENT_VERSION)"
        exit 0
    fi
    echo "win32yank ${CURRENT_VERSION:-unknown} is installed, upgrading to $LATEST_VERSION..."
else
    echo "Installing win32yank $LATEST_VERSION..."
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
echo "Downloading from $URL..."
curl -fsSL "$URL" -o "$TMP_DIR/$ASSET"
unzip -q -o "$TMP_DIR/$ASSET" win32yank.exe -d "$TMP_DIR"

mkdir -p "$INSTALL_DIR"
install -m 755 "$TMP_DIR/win32yank.exe" "$BINARY"
echo "win32yank installed successfully to $BINARY"
