#!/usr/bin/env bash
set -Eeuo pipefail

create_symlink() {
    SRC="$1"
    DST="$2"

    if [[ ! -e "$SRC" ]]; then
        echo "ERROR: $SRC does not exist"
        exit 1
    fi

    if [[ -e "$DST" || -L "$DST" ]]; then
        echo "$DST already exist, removing it"
        rm -rf "$DST"
    fi

    DST_DIR="$(dirname "$DST")"
    # Remove broken symlink if it exists, so we can create the directory
    if [[ -L "$DST_DIR" && ! -e "$DST_DIR" ]]; then
        echo "$DST_DIR is a broken symlink, removing it"
        rm -f "$DST_DIR"
    fi
    if [[ ! -e "$DST_DIR" ]]; then
        echo "Create directory $DST_DIR"
        mkdir -p "$DST_DIR"
    fi

    echo "Create symlink $SRC -> $DST"
    ln -sf "$SRC" "$DST"
}

is_arch() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=arch' /etc/os-release
}

is_ubuntu() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=ubuntu' /etc/os-release
}

is_work() {
    [[ "$USER" == "13lbise" ]]
}

is_wsl() {
    [[ -f /proc/version ]] && grep -qi 'microsoft\|wsl' /proc/version
}

# Get the current OS name (linux or macos)
get_os() {
    local os
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    case "$os" in
        linux)
            echo "linux"
            ;;
        darwin)
            echo "macos"
            ;;
        *)
            echo "Unsupported OS: $os" >&2
            return 1
            ;;
    esac
}

# Get the current architecture (x86_64 or arm64)
get_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64)
            echo "x86_64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            echo "Unsupported architecture: $arch" >&2
            return 1
            ;;
    esac
}

# Get the latest release tag from a GitHub repository
# Usage: get_github_latest_tag "owner/repo"
get_github_latest_tag() {
    local repo="$1"
    curl -sL "https://api.github.com/repos/${repo}/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p'
}

# Extract version number from a version string (strips leading 'v' and extra info)
# Usage: normalize_version "v1.2.3" -> "1.2.3"
#        normalize_version "NVIM v0.11.5" -> "0.11.5"
normalize_version() {
    local version="$1"
    # Extract version number: find pattern like v1.2.3 or 1.2.3 and strip the 'v'
    echo "$version" | grep -oE 'v?[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1 | sed 's/^v//'
}

# Install a binary from a GitHub release tarball to ~/.local/bin
# Also installs share/ and lib/ directories to ~/.local if present in the archive
# Usage: install_github_release "tool_name" "owner/repo" "tarball_url" "latest_tag" ["binary_name_in_archive"]
# - tool_name: name of the tool (used for messages and default binary name)
# - owner/repo: GitHub repository (e.g., "tmux/tmux-builds")
# - tarball_url: full URL to the .tar.gz file
# - latest_tag: the latest release tag (e.g., "v1.2.3")
# - binary_name_in_archive: optional, name of binary inside archive (defaults to tool_name)
install_github_release() {
    local tool_name="$1"
    local repo="$2"
    local tarball_url="$3"
    local latest_tag="$4"
    local binary_name="${5:-$tool_name}"
    local install_dir="$HOME/.local/bin"
    local local_dir="$HOME/.local"

    local latest_version
    latest_version=$(normalize_version "$latest_tag")

    # Check if already installed and up to date
    if [[ -x "$install_dir/$tool_name" ]]; then
        local current_version_raw current_version
        # Try --version first, then -V, then -v
        current_version_raw=$("$install_dir/$tool_name" --version 2>/dev/null | head -n1) ||
            current_version_raw=$("$install_dir/$tool_name" -V 2>/dev/null | head -n1) ||
            current_version_raw=$("$install_dir/$tool_name" -v 2>/dev/null | head -n1) ||
            current_version_raw=""
        current_version=$(normalize_version "$current_version_raw")

        if [[ -z "$current_version" ]]; then
            echo "ERROR: $tool_name is installed but could not determine version" >&2
            echo "Tried: --version, -V, -v" >&2
            return 1
        fi

        if [[ "$current_version" == "$latest_version" ]]; then
            echo "$tool_name is already up to date ($current_version)"
            return 0
        else
            echo "$tool_name $current_version is installed, upgrading to $latest_version..."
        fi
    else
        echo "Installing $tool_name $latest_version..."
    fi

    echo "Downloading from $tarball_url..."

    # Create temporary directory for extraction
    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' RETURN

    # Download and extract
    if ! curl -fsSL "$tarball_url" | tar -xz -C "$tmp_dir"; then
        echo "Failed to download or extract $tool_name" >&2
        return 1
    fi

    # Find the binary (could be in root or a subdirectory)
    local binary_path
    binary_path=$(find "$tmp_dir" -name "$binary_name" -type f -executable 2>/dev/null | head -n1)
    if [[ -z "$binary_path" ]]; then
        # Try without executable check (might need chmod)
        binary_path=$(find "$tmp_dir" -name "$binary_name" -type f 2>/dev/null | head -n1)
    fi

    if [[ -z "$binary_path" ]]; then
        echo "Binary '$binary_name' not found in archive" >&2
        echo "Archive contents:" >&2
        find "$tmp_dir" -type f >&2
        return 1
    fi

    # Ensure install directory exists
    mkdir -p "$install_dir"

    # Install the binary
    mv "$binary_path" "$install_dir/$tool_name"
    chmod +x "$install_dir/$tool_name"

    echo "$tool_name installed successfully to $install_dir/$tool_name"

    # Install share/ directory if present (for runtime files, help docs, etc.)
    local share_dir
    share_dir=$(find "$tmp_dir" -type d -name "share" 2>/dev/null | head -n1)
    if [[ -n "$share_dir" && -d "$share_dir" ]]; then
        mkdir -p "$local_dir/share"
        cp -r "$share_dir"/* "$local_dir/share/"
        echo "Installed share files to $local_dir/share"
    fi

    # Install lib/ directory if present (for libraries, plugins, etc.)
    local lib_dir
    lib_dir=$(find "$tmp_dir" -type d -name "lib" 2>/dev/null | head -n1)
    if [[ -n "$lib_dir" && -d "$lib_dir" ]]; then
        mkdir -p "$local_dir/lib"
        cp -r "$lib_dir"/* "$local_dir/lib/"
        echo "Installed lib files to $local_dir/lib"
    fi
}
