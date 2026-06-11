#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DEFAULT_POOL_DIR="/mnt/ch03pool/murten_mirror/shannon/linux/tools/opencode"
POOL_DIR="${OPENCODE_ARCHIVES_DIR:-$DEFAULT_POOL_DIR}"
OUTPUT_DIR="$PWD"
PUBLISH=true
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
PACKAGE_NAME="opencode-offline-${TIMESTAMP}.tar.gz"
PACKAGE_OUTPUT_PATH=""
TEMP_DIR=""
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PACKAGE_HASH=""
OPENCODE_VERSION=""
CONFIG_DEPS_INCLUDED=false
MODELS_CACHE_INCLUDED=false

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS] [output_directory]

Create an offline opencode bundle containing:
- ~/.opencode/ (binary and local opencode-managed packages)
- ~/.cache/opencode/ (cached dependencies and downloaded tools)
- ~/.cache/opencode/models.json (cached models.dev catalog for proxied/offline machines)
- ~/.config/opencode/node_modules and lockfiles when present
- an install.sh helper for target machines without npm access

Options:
  --pool-dir DIR     Publish archive to DIR (default: $DEFAULT_POOL_DIR)
  --no-publish       Keep the archive in output_directory instead of moving it to the pool
  --help, -h         Show this help message

Arguments:
  output_directory   Directory to save the package before publish (default: current directory)

Examples:
  $(basename "$0")
  $(basename "$0") --no-publish /tmp
  $(basename "$0") --pool-dir /srv/mirror/opencode
EOF
}

cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

ensure_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        error "Missing required command: $1"
    fi
}

check_dependencies() {
    log "Checking packaging dependencies..."
    for cmd in tar mktemp sha256sum; do
        ensure_command "$cmd"
    done
    log "✓ Dependencies available"
}

resolve_opencode_home() {
    local opencode_home="$HOME/.opencode"
    [[ -d "$opencode_home" ]] || error "Could not find $opencode_home. Install opencode first on the packaging machine."
    [[ -x "$opencode_home/bin/opencode" ]] || error "Could not find executable opencode binary at $opencode_home/bin/opencode"
    printf '%s\n' "$opencode_home"
}

resolve_opencode_cache() {
    local cache_dir="$HOME/.cache/opencode"
    [[ -d "$cache_dir" ]] || error "Could not find $cache_dir. Run opencode at least once so offline dependencies are cached."
    printf '%s\n' "$cache_dir"
}

resolve_opencode_config_dir() {
    local config_dir="$HOME/.config/opencode"
    if [[ -f "$config_dir/package.json" && -d "$config_dir/node_modules" ]]; then
        printf '%s\n' "$config_dir"
        return 0
    fi

    printf '\n'
}

load_opencode_metadata() {
    local opencode_home="$1"

    OPENCODE_VERSION="$("$opencode_home/bin/opencode" --version 2>/dev/null | head -1 | tr -d '[:space:]')"
    [[ -n "$OPENCODE_VERSION" ]] || OPENCODE_VERSION="unknown"

    if [[ "$OPENCODE_VERSION" != "unknown" ]]; then
        PACKAGE_NAME="opencode-v${OPENCODE_VERSION}-offline-${TIMESTAMP}.tar.gz"
    fi
}

ensure_models_cache() {
    local opencode_home="$1"
    local cache_dir="$2"
    local models_file="$cache_dir/models.json"

    if [[ ! -s "$models_file" ]]; then
        log "models.dev cache missing; refreshing $models_file"
        if ! "$opencode_home/bin/opencode" models --refresh >/dev/null; then
            error "Could not refresh models.dev cache. Run 'opencode models --refresh' on a machine with access to https://models.dev and retry."
        fi
    fi

    [[ -s "$models_file" ]] || error "Cached models.dev catalog is missing or empty: $models_file"

    if ! OPENCODE_DISABLE_MODELS_FETCH=1 OPENCODE_MODELS_PATH="$models_file" "$opencode_home/bin/opencode" models >/dev/null; then
        error "Cached models.dev catalog is not readable by opencode: $models_file"
    fi

    MODELS_CACHE_INCLUDED=true
}

compute_package_hash() {
    local stage_root="$1"
    (
        cd "$stage_root"
        local hash_paths=(.opencode .cache/opencode)
        if [[ -d .config/opencode/node_modules ]]; then
            hash_paths+=(.config/opencode)
        fi
        tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -cf - "${hash_paths[@]}"
    ) | sha256sum | awk '{print $1}'
}

stage_config_deps() {
    local config_dir="$1"
    [[ -n "$config_dir" ]] || return 0

    mkdir -p "$TEMP_DIR/.config/opencode"
    cp -a "$config_dir/node_modules" "$TEMP_DIR/.config/opencode/node_modules"

    local extra_file
    for extra_file in package.json package-lock.json bun.lock; do
        if [[ -f "$config_dir/$extra_file" ]]; then
            cp -a "$config_dir/$extra_file" "$TEMP_DIR/.config/opencode/$extra_file"
        fi
    done

    CONFIG_DEPS_INCLUDED=true
}

stage_runtime() {
    local opencode_home="$1"
    local cache_dir="$2"
    local config_dir="$3"

    TEMP_DIR="$(mktemp -d)"
    trap cleanup EXIT

    mkdir -p "$TEMP_DIR/.cache"
    cp -a "$opencode_home" "$TEMP_DIR/.opencode"
    cp -a "$cache_dir" "$TEMP_DIR/.cache/opencode"
    if [[ -f "$TEMP_DIR/.cache/opencode/models.json" ]]; then
        touch "$TEMP_DIR/.cache/opencode/models.json"
    fi
    stage_config_deps "$config_dir"

    PACKAGE_HASH="$(compute_package_hash "$TEMP_DIR")"

    cat > "$TEMP_DIR/manifest.env" <<EOF
OPENCODE_VERSION='$OPENCODE_VERSION'
CREATED_AT='$CREATED_AT'
PACKAGE_HASH='$PACKAGE_HASH'
MODELS_CACHE_INCLUDED='$MODELS_CACHE_INCLUDED'
EOF

    cp "$TEMP_DIR/manifest.env" "$TEMP_DIR/.opencode/manifest.env"
}

create_install_script() {
    cat > "$TEMP_DIR/install.sh" <<'EOF'
#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_OPENCODE_DIR="$SCRIPT_DIR/.opencode"
SOURCE_CACHE_DIR="$SCRIPT_DIR/.cache/opencode"
SOURCE_CONFIG_DIR="$SCRIPT_DIR/.config/opencode"
TARGET_OPENCODE_DIR="$HOME/.opencode"
TARGET_CACHE_DIR="$HOME/.cache/opencode"
TARGET_CONFIG_DIR="$HOME/.config/opencode"
TARGET_BIN_DIR="$HOME/.local/bin"
STAGING_OPENCODE_DIR="${TARGET_OPENCODE_DIR}.tmp.$$"
STAGING_CACHE_DIR="${TARGET_CACHE_DIR}.tmp.$$"
BACKUP_OPENCODE_DIR="${TARGET_OPENCODE_DIR}.old.$$"
BACKUP_CACHE_DIR="${TARGET_CACHE_DIR}.old.$$"
TARGET_WRAPPER="$TARGET_OPENCODE_DIR/bin/opencode"
TARGET_REAL_BIN="$TARGET_OPENCODE_DIR/bin/opencode.real"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

package_version() {
    local manifest="$TARGET_OPENCODE_DIR/manifest.env"
    if [[ -f "$manifest" ]]; then
        # shellcheck disable=SC1090
        source "$manifest"
        printf '%s\n' "${OPENCODE_VERSION:-}"
    fi
}

if [[ ! -d "$SOURCE_OPENCODE_DIR" ]]; then
    echo "ERROR: Could not find .opencode directory next to install.sh" >&2
    exit 1
fi

if [[ ! -d "$SOURCE_CACHE_DIR" ]]; then
    echo "ERROR: Could not find .cache/opencode directory next to install.sh" >&2
    exit 1
fi

log "Preparing install directories"
rm -rf "$STAGING_OPENCODE_DIR" "$STAGING_CACHE_DIR" "$BACKUP_OPENCODE_DIR" "$BACKUP_CACHE_DIR"
mkdir -p "$(dirname "$TARGET_OPENCODE_DIR")" "$(dirname "$TARGET_CACHE_DIR")" "$TARGET_BIN_DIR"

log "Copying opencode runtime"
cp -a "$SOURCE_OPENCODE_DIR" "$STAGING_OPENCODE_DIR"

log "Copying opencode cache"
cp -a "$SOURCE_CACHE_DIR" "$STAGING_CACHE_DIR"

log "Swapping packaged runtime into place"
if [[ -e "$TARGET_OPENCODE_DIR" ]]; then
    mv "$TARGET_OPENCODE_DIR" "$BACKUP_OPENCODE_DIR"
fi
mv "$STAGING_OPENCODE_DIR" "$TARGET_OPENCODE_DIR"

log "Swapping packaged cache into place"
if [[ -e "$TARGET_CACHE_DIR" ]]; then
    mv "$TARGET_CACHE_DIR" "$BACKUP_CACHE_DIR"
fi
mv "$STAGING_CACHE_DIR" "$TARGET_CACHE_DIR"

if [[ -d "$SOURCE_CONFIG_DIR/node_modules" ]]; then
    log "Installing opencode config dependencies"
    mkdir -p "$TARGET_CONFIG_DIR"
    rm -rf "$TARGET_CONFIG_DIR/node_modules"
    cp -a "$SOURCE_CONFIG_DIR/node_modules" "$TARGET_CONFIG_DIR/node_modules"

    config_file=""
    for config_file in package.json package-lock.json bun.lock; do
        if [[ -f "$SOURCE_CONFIG_DIR/$config_file" ]]; then
            cp -a "$SOURCE_CONFIG_DIR/$config_file" "$TARGET_CONFIG_DIR/$config_file"
        fi
    done
fi

log "Installing opencode launcher wrapper"
if [[ ! -x "$TARGET_REAL_BIN" ]]; then
    mv "$TARGET_WRAPPER" "$TARGET_REAL_BIN"
fi
cat > "$TARGET_WRAPPER" <<'LAUNCHER_EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_OPENCODE_DIR="$HOME/.opencode"
TARGET_CACHE_DIR="$HOME/.cache/opencode"
TARGET_REAL_BIN="$TARGET_OPENCODE_DIR/bin/opencode.real"

if [[ -f "$TARGET_CACHE_DIR/models.json" ]]; then
    if [[ -z "${OPENCODE_MODELS_PATH+x}" ]]; then
        export OPENCODE_MODELS_PATH="$TARGET_CACHE_DIR/models.json"
    fi
    if [[ -z "${OPENCODE_DISABLE_MODELS_FETCH+x}" ]]; then
        export OPENCODE_DISABLE_MODELS_FETCH=1
    fi
fi

if [[ -z "${OPENCODE_DISABLE_AUTOUPDATE+x}" ]]; then
    export OPENCODE_DISABLE_AUTOUPDATE=1
fi

exec "$TARGET_REAL_BIN" "$@"
LAUNCHER_EOF
chmod +x "$TARGET_WRAPPER"
ln -sfn "$TARGET_WRAPPER" "$TARGET_BIN_DIR/opencode"

if [[ ! -x "$TARGET_WRAPPER" || ! -x "$TARGET_REAL_BIN" ]]; then
    echo "ERROR: Installed opencode launcher or real binary is missing or not executable" >&2
    exit 1
fi

installed_version="$(package_version)"
echo "Installed opencode ${installed_version:-unknown}"
echo "Runtime installed to: $TARGET_OPENCODE_DIR"
echo "Cache installed to: $TARGET_CACHE_DIR"
if [[ -d "$SOURCE_CONFIG_DIR/node_modules" ]]; then
    echo "Config dependencies installed to: $TARGET_CONFIG_DIR/node_modules"
fi
echo "Launcher installed to: $TARGET_WRAPPER"
echo "PATH launcher installed to: $TARGET_BIN_DIR/opencode"
if [[ -f "$TARGET_CACHE_DIR/models.json" ]]; then
    echo "Packaged models catalog enabled: $TARGET_CACHE_DIR/models.json"
fi

if [[ ":$PATH:" != *":$TARGET_BIN_DIR:"* ]]; then
    echo "WARNING: $TARGET_BIN_DIR is not in PATH. Add this to your shell profile:" >&2
    echo "  export PATH=\"$TARGET_BIN_DIR:\$PATH\"" >&2
fi

for old_dir in "$BACKUP_OPENCODE_DIR" "$BACKUP_CACHE_DIR"; do
    if [[ -e "$old_dir" ]]; then
        log "Cleaning old install in background: $old_dir"
        rm -rf "$old_dir" >/dev/null 2>&1 &
    fi
done
EOF

    chmod +x "$TEMP_DIR/install.sh"
}

create_readme() {
    cat > "$TEMP_DIR/README.md" <<EOF
# opencode Offline Package

This archive contains an offline opencode runtime bundle.

## Contents

- \.opencode/ with the opencode binary and local opencode-managed packages
- \.cache/opencode/ with cached dependencies and downloaded tools
- \.cache/opencode/models.json with the cached models.dev catalog
- \.config/opencode/node_modules plus package manager files when config plugin deps are present
- install.sh to install the bundle on a machine without npm access

## Installation

\`\`\`bash
tar -xzf ${PACKAGE_NAME}
cd <extract-dir>
./install.sh
\`\`\`

## Runtime Layout

After installation, the package-managed files live in:

- ~/.opencode
- ~/.cache/opencode
- launcher wrapper: ~/.local/bin/opencode

The launcher uses the packaged \`~/.cache/opencode/models.json\` catalog and sets \`OPENCODE_DISABLE_MODELS_FETCH=1\` by default when that file exists. This prevents startup refresh attempts to \`https://models.dev/api.json\` on proxied/offline machines. Set \`OPENCODE_DISABLE_MODELS_FETCH=false\` before running \`opencode\` if you explicitly want to allow online model refreshes.

This package intentionally does not include user data such as:

- ~/.local/share/opencode
- ~/.local/state/opencode

It also does not overwrite config content such as \`opencode.json\`, plugins, commands, or skills. When config-side npm dependencies are present on the packaging machine, the installer only refreshes \`~/.config/opencode/node_modules\` and related lockfiles.

## Package Metadata

- opencode version: ${OPENCODE_VERSION}
- created at: ${CREATED_AT}
- package hash: ${PACKAGE_HASH}
- models cache included: ${MODELS_CACHE_INCLUDED}
EOF
}

publish_archive() {
    if [[ "$PUBLISH" != true ]]; then
        return 0
    fi

    if [[ ! -d "$POOL_DIR" ]]; then
        log "Pool not accessible, attempting to mount: $POOL_DIR"
        sudo mount -a || true
    fi

    local pool_parent
    pool_parent="$(dirname "$POOL_DIR")"
    [[ -d "$pool_parent" ]] || error "Pool parent directory not found: $pool_parent"

    mkdir -p "$POOL_DIR"

    log "Publishing archive to $POOL_DIR"
    mv "$PACKAGE_OUTPUT_PATH" "$POOL_DIR/"
    PACKAGE_OUTPUT_PATH="$POOL_DIR/$PACKAGE_NAME"

    log "Cleaning up older opencode archives in $POOL_DIR"
    local old_archives
    old_archives=$(find "$POOL_DIR" -maxdepth 1 -name 'opencode-v*-offline-*.tar.gz' -type f ! -name "$PACKAGE_NAME" 2>/dev/null || true)
    if [[ -n "$old_archives" ]]; then
        while IFS= read -r old_archive; do
            [[ -n "$old_archive" ]] || continue
            rm -f "$old_archive"
        done <<< "$old_archives"
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --pool-dir)
                POOL_DIR="$2"
                shift 2
                ;;
            --no-publish)
                PUBLISH=false
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            -*)
                error "Unknown option: $1"
                ;;
            *)
                OUTPUT_DIR="$1"
                shift
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    check_dependencies

    [[ -d "$OUTPUT_DIR" ]] || error "Output directory does not exist: $OUTPUT_DIR"
    OUTPUT_DIR="$(realpath "$OUTPUT_DIR")"

    local opencode_home cache_dir config_dir
    opencode_home="$(resolve_opencode_home)"
    cache_dir="$(resolve_opencode_cache)"
    config_dir="$(resolve_opencode_config_dir)"
    load_opencode_metadata "$opencode_home"
    ensure_models_cache "$opencode_home" "$cache_dir"
    stage_runtime "$opencode_home" "$cache_dir" "$config_dir"
    create_install_script
    create_readme

    PACKAGE_OUTPUT_PATH="$OUTPUT_DIR/$PACKAGE_NAME"

    log "Creating tarball: $PACKAGE_NAME"
    (
        cd "$TEMP_DIR"
        local tar_paths=(.opencode .cache install.sh README.md manifest.env)
        if [[ -d .config/opencode/node_modules ]]; then
            tar_paths+=(.config)
        fi
        tar -czf "$PACKAGE_OUTPUT_PATH" "${tar_paths[@]}"
    )

    publish_archive

    local package_size
    package_size="$(du -sh "$PACKAGE_OUTPUT_PATH" | cut -f1)"
    log "Package created successfully"
    log "Location: $PACKAGE_OUTPUT_PATH"
    log "Size: $package_size"
}

main "$@"
