#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

install_nvim() {
    echo ">> Installing nvim..."

    if is_arch; then
        echo "Skipped on arch linux, done using yay"
        return 0
    fi

    local repo="neovim/neovim"
    local os arch tag tarball_url nvim_os nvim_arch

    os=$(get_os) || return 1
    arch=$(get_arch) || return 1
    tag=$(get_github_latest_tag "$repo")

    # Map to neovim's naming convention
    # Neovim releases: nvim-linux-x86_64.tar.gz, nvim-linux-arm64.tar.gz, nvim-macos-x86_64.tar.gz, nvim-macos-arm64.tar.gz
    case "$os" in
        linux) nvim_os="linux" ;;
        macos) nvim_os="macos" ;;
    esac

    case "$arch" in
        x86_64) nvim_arch="x86_64" ;;
        arm64)  nvim_arch="arm64" ;;
    esac

    tarball_url="https://github.com/${repo}/releases/download/${tag}/nvim-${nvim_os}-${nvim_arch}.tar.gz"

    install_github_release "nvim" "$repo" "$tarball_url" "$tag" "nvim"
}

install_tree_sitter_with_cargo() {
    local tag="$1"
    local local_bin="$2"
    local cargo_bin=""
    local version=""
    local version_output=""

    cargo_bin=$(command -v cargo 2>/dev/null || true)
    if [[ -z "$cargo_bin" && -x "$HOME/.cargo/bin/cargo" ]]; then
        cargo_bin="$HOME/.cargo/bin/cargo"
    fi

    if [[ -z "$cargo_bin" ]]; then
        echo "tree-sitter source build requires cargo." >&2
        echo "Install Rust with rustup and rerun:" >&2
        echo "  curl https://sh.rustup.rs -sSf | sh -s -- -y" >&2
        return 1
    fi

    version=$(normalize_version "$tag")
    echo "Building tree-sitter ${version} from source with cargo..."
    echo "Using cargo --no-default-features to avoid the libclang/QuickJS build dependency."

    mkdir -p "$(dirname "$local_bin")"

    if ! "$cargo_bin" install --locked --force --root "$HOME/.local" tree-sitter-cli --version "$version" --no-default-features; then
        echo "Failed to build tree-sitter ${version} with cargo." >&2
        echo "This install path avoids libclang; ensure Rust is up to date: rustup update" >&2
        echo "tree-sitter generate will use node as the JavaScript runtime." >&2
        return 1
    fi

    if version_output=$("$local_bin" --version 2>&1); then
        echo "tree-sitter installed successfully to $local_bin (${version_output})"
        return 0
    fi

    echo "tree-sitter was built, but the installed binary failed to run." >&2
    echo "$version_output" >&2
    return 1
}

install_tree_sitter() {
    echo ">> Installing tree-sitter..."

    local local_bin="$HOME/.local/bin/tree-sitter"
    local existing_bin=""
    local version=""

    for candidate in "$local_bin" "$(command -v tree-sitter 2>/dev/null || true)"; do
        [[ -z "$candidate" ]] && continue
        if [[ -x "$candidate" ]] && "$candidate" --version >/dev/null 2>&1; then
            existing_bin="$candidate"
            break
        fi
    done

    if [[ -n "$existing_bin" ]]; then
        version=$($existing_bin --version 2>/dev/null | head -n1 || echo "version unknown")
        echo "tree-sitter is already installed (${version})"
        return 0
    fi

    if [[ -x "$local_bin" ]]; then
        echo "Removing broken tree-sitter binary at $local_bin"
        rm -f "$local_bin"
    fi

    if is_arch; then
        echo "Skipped on arch linux, done using pacman"
        return 0
    fi

    local repo="tree-sitter/tree-sitter"
    local os arch tag target binary_url tmp_dir version_output

    os=$(get_os) || return 1
    arch=$(get_arch) || return 1
    tag=$(get_github_latest_tag "$repo")

    case "$os" in
        linux)
            case "$arch" in
                x86_64) target="linux-x64" ;;
                arm64)  target="linux-arm64" ;;
                *)
                    echo "Unsupported architecture for tree-sitter on linux: $arch" >&2
                    return 1
                    ;;
            esac
            ;;
        macos)
            case "$arch" in
                x86_64) target="macos-x64" ;;
                arm64)  target="macos-arm64" ;;
                *)
                    echo "Unsupported architecture for tree-sitter on macos: $arch" >&2
                    return 1
                    ;;
            esac
            ;;
        *)
            echo "Unsupported OS for tree-sitter: $os" >&2
            return 1
            ;;
    esac

    binary_url="https://github.com/${repo}/releases/download/${tag}/tree-sitter-${target}.gz"
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' RETURN

    echo "Downloading from $binary_url..."
    mkdir -p "$(dirname "$local_bin")"

    if ! curl -fsSL "$binary_url" | gzip -dc > "$tmp_dir/tree-sitter"; then
        echo "Failed to download or extract tree-sitter" >&2
        return 1
    fi

    chmod +x "$tmp_dir/tree-sitter"

    if version_output=$("$tmp_dir/tree-sitter" --version 2>&1); then
        mv "$tmp_dir/tree-sitter" "$local_bin"
        echo "tree-sitter installed successfully to $local_bin (${version_output})"
        return 0
    fi

    echo "Downloaded tree-sitter binary from GitHub is not compatible with this system." >&2
    echo "$version_output" >&2
    echo "Falling back to building tree-sitter from source..." >&2
    install_tree_sitter_with_cargo "$tag" "$local_bin"
}

install_nvim
install_tree_sitter
