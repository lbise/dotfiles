#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DEFAULT_ARCHIVES_DIR="/mnt/ch03pool/murten_mirror/shannon/linux/tools/pi"
ARCHIVES_DIR="${PI_ARCHIVES_DIR:-$DEFAULT_ARCHIVES_DIR}"
FORCE_INSTALL=false
ARCHIVE_PATH=""
TARGET_RUNTIME_DIR="$HOME/.local/share/pi-runtime"
TARGET_BIN_DIR="$HOME/.local/bin"
TARGET_RTK_BIN="$TARGET_RUNTIME_DIR/node/bin/rtk"
TARGET_RTK_WRAPPER="$TARGET_BIN_DIR/rtk"
TEMP_DIR=""

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Install or update the offline pi bundle on a machine without npm access.
The script also ensures bundled RTK is installed for Pi's RTK-accelerated tools.
By default the script looks for the newest archive in:
  $DEFAULT_ARCHIVES_DIR

Options:
  --archive PATH        Install a specific archive instead of the newest one in the archive directory
  --archives-dir DIR    Override the directory searched for archives
  --force               Reinstall even if the same pi + Node versions are already installed
  --help, -h            Show this help message

Examples:
  $(basename "$0")
  $(basename "$0") --force
  $(basename "$0") --archive /mnt/share/pi/pi-v0.67.1-node22.19.0-offline-20260415_120000.tar.gz
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
    log "Checking update dependencies..."
    for cmd in tar mktemp; do
        ensure_command "$cmd"
    done
    log "✓ Dependencies available"
}

find_latest_archive() {
    [[ -d "$ARCHIVES_DIR" ]] || {
        log "Archive directory not accessible, attempting to mount: $ARCHIVES_DIR"
        sudo mount -a || true
    }

    [[ -d "$ARCHIVES_DIR" ]] || error "Archive directory not found: $ARCHIVES_DIR"

    shopt -s nullglob
    local archives=("$ARCHIVES_DIR"/pi-v*-node*-offline-*.tar.gz)
    shopt -u nullglob

    (( ${#archives[@]} > 0 )) || error "No pi offline archives found in $ARCHIVES_DIR"

    ls -1t "${archives[@]}" | head -1
}

load_manifest_env() {
    local manifest_file="$1"
    [[ -f "$manifest_file" ]] || error "Manifest not found: $manifest_file"

    unset PI_VERSION NODE_VERSION PI_NODE_ENGINE PI_MIN_NODE_VERSION MANIFEST_HASH RTK_VERSION RTK_TARGET RTK_ARCHIVE_NAME
    # shellcheck disable=SC1090
    source "$manifest_file"
}

get_installed_versions() {
    if [[ -f "$TARGET_RUNTIME_DIR/manifest.env" ]]; then
        (
            unset PI_VERSION NODE_VERSION MANIFEST_HASH RTK_VERSION
            # shellcheck disable=SC1090
            source "$TARGET_RUNTIME_DIR/manifest.env"
            printf '%s\t%s\t%s\t%s\n' "${PI_VERSION:-}" "${NODE_VERSION:-}" "${MANIFEST_HASH:-}" "${RTK_VERSION:-}"
        )
        return 0
    fi

    printf '\t\t\t\n'
}

archive_bundles_rtk() {
    [[ -x "$TEMP_DIR/pi-runtime/node/bin/rtk" ]]
}

archive_requires_rtk() {
    archive_bundles_rtk && return 0
    [[ -f "$TEMP_DIR/pi-runtime/offline-packages.json" ]] || return 1
    grep -q 'pi-rtk-optimizer' "$TEMP_DIR/pi-runtime/offline-packages.json"
}

remove_stale_rtk_wrapper() {
    if [[ -f "$TARGET_RTK_WRAPPER" ]] && grep -q 'node/bin/rtk' "$TARGET_RTK_WRAPPER" 2>/dev/null && [[ ! -x "$TARGET_RTK_BIN" ]]; then
        rm -f "$TARGET_RTK_WRAPPER"
        log "Removed stale RTK wrapper at $TARGET_RTK_WRAPPER"
    fi
}

write_rtk_wrapper() {
    mkdir -p "$TARGET_BIN_DIR"
    cat > "$TARGET_RTK_WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
RUNTIME_DIR="${HOME}/.local/share/pi-runtime"
exec "${RUNTIME_DIR}/node/bin/rtk" "$@"
EOF
    chmod +x "$TARGET_RTK_WRAPPER"
}

runtime_rtk_version() {
    "$TARGET_RTK_BIN" --version 2>/dev/null
}

external_rtk_version() {
    rtk --version 2>/dev/null
}

ensure_rtk_installed() {
    local rtk_required=false
    if [[ -n "${RTK_VERSION:-}" ]] || archive_requires_rtk; then
        rtk_required=true
    fi

    if [[ "$rtk_required" != true ]]; then
        remove_stale_rtk_wrapper
        return 0
    fi

    if [[ -x "$TARGET_RTK_BIN" ]]; then
        local runtime_version
        runtime_version="$(runtime_rtk_version || true)"
        if [[ -n "$runtime_version" ]]; then
            write_rtk_wrapper
            log "✓ RTK available: $runtime_version"
            return 0
        fi

        if ! archive_bundles_rtk; then
            error "Bundled RTK exists at $TARGET_RTK_BIN but failed to start. Rebuild the offline archive with a compatible RTK binary."
        fi

        log "Bundled RTK exists but failed to start; reinstalling archive"
        install_archive
        runtime_version="$(runtime_rtk_version || true)"
        [[ -n "$runtime_version" ]] || error "Bundled RTK was installed but still failed to start after reinstall"
        write_rtk_wrapper
        log "✓ RTK available: $runtime_version"
        return 0
    fi

    if archive_bundles_rtk; then
        log "RTK missing from installed runtime; reinstalling archive to install bundled RTK"
        install_archive
        local runtime_version
        runtime_version="$(runtime_rtk_version || true)"
        [[ -n "$runtime_version" ]] || error "RTK was bundled in the archive but is still missing after installation"
        write_rtk_wrapper
        log "✓ RTK available: $runtime_version"
        return 0
    fi

    if command -v rtk >/dev/null 2>&1; then
        local external_path external_version
        external_path="$(command -v rtk)"
        external_version="$(external_rtk_version || true)"
        if [[ -n "$external_version" ]]; then
            log "✓ Using external RTK: $external_version ($external_path)"
            return 0
        fi
    fi

    if [[ -n "${RTK_VERSION:-}" ]]; then
        error "RTK ${RTK_VERSION} is required for pi-rtk-optimizer but is not installed. Rebuild the offline archive with scripts/pi_package.sh so it bundles RTK, or install RTK manually."
    fi

    error "RTK is required for pi-rtk-optimizer but is not installed. Rebuild the offline archive with scripts/pi_package.sh so it bundles RTK, or install RTK manually."
}

extract_archive() {
    local archive="$1"
    TEMP_DIR="$(mktemp -d)"
    trap cleanup EXIT

    log "Extracting $(basename "$archive")"
    tar -xzf "$archive" -C "$TEMP_DIR"

    [[ -f "$TEMP_DIR/install.sh" ]] || error "Invalid archive: install.sh not found"
    [[ -f "$TEMP_DIR/manifest.env" ]] || error "Invalid archive: manifest.env not found"
}

install_archive() {
    log "Running archive installer"
    (
        cd "$TEMP_DIR"
        ./install.sh
    )
}

verify_installation() {
    if [[ -f "$TARGET_RUNTIME_DIR/manifest.env" ]]; then
        # shellcheck disable=SC1090
        source "$TARGET_RUNTIME_DIR/manifest.env"
        log "Installed pi version: ${PI_VERSION:-unknown}"
        log "Bundled Node version: ${NODE_VERSION:-unknown}"
        if [[ -n "${PI_NODE_ENGINE:-}" ]]; then
            log "pi Node requirement: ${PI_NODE_ENGINE}"
        fi
        if [[ -n "${RTK_VERSION:-}" ]]; then
            log "Bundled RTK version: ${RTK_VERSION}"
        fi
    fi

    if [[ -x "$TARGET_BIN_DIR/pi" ]]; then
        log "✓ pi wrapper installed at $TARGET_BIN_DIR/pi"
    else
        log "⚠ pi wrapper not found at $TARGET_BIN_DIR/pi"
    fi

    ensure_rtk_installed
    if [[ -x "$TARGET_RTK_WRAPPER" ]]; then
        log "✓ rtk wrapper installed at $TARGET_RTK_WRAPPER"
    fi

    local startup_log="$TEMP_DIR/pi-startup-check.log"
    mkdir -p "$TEMP_DIR/home"
    if HOME="$TEMP_DIR/home" \
        PATH="$TARGET_RUNTIME_DIR/node/bin:${PATH}" \
        NPM_CONFIG_PREFIX="$TARGET_RUNTIME_DIR/node" \
        npm_config_prefix="$TARGET_RUNTIME_DIR/node" \
        "$TARGET_RUNTIME_DIR/node/bin/node" "$TARGET_RUNTIME_DIR/pi/dist/cli.js" --help >"$startup_log" 2>&1; then
        log "✓ pi CLI startup check passed"
    else
        cat "$startup_log" >&2
        error "pi failed to start after installation. Rebuild the offline archive with scripts/pi_package.sh using Node ${PI_MIN_NODE_VERSION:-compatible with this pi version} or newer."
    fi

    if [[ ":$PATH:" != *":$TARGET_BIN_DIR:"* ]]; then
        log "⚠ $TARGET_BIN_DIR is not in PATH. Add this to your shell profile:"
        log "    export PATH=\"$TARGET_BIN_DIR:\$PATH\""
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --archive)
                ARCHIVE_PATH="$2"
                shift 2
                ;;
            --archives-dir)
                ARCHIVES_DIR="$2"
                shift 2
                ;;
            --force)
                FORCE_INSTALL=true
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
                error "Unexpected argument: $1"
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    check_dependencies

    if [[ -z "$ARCHIVE_PATH" ]]; then
        ARCHIVE_PATH="$(find_latest_archive)"
    fi

    [[ -f "$ARCHIVE_PATH" ]] || error "Archive not found: $ARCHIVE_PATH"
    ARCHIVE_PATH="$(realpath "$ARCHIVE_PATH")"

    extract_archive "$ARCHIVE_PATH"
    load_manifest_env "$TEMP_DIR/manifest.env"

    local archive_pi_version="${PI_VERSION:-}"
    local archive_node_version="${NODE_VERSION:-}"
    local archive_manifest_hash="${MANIFEST_HASH:-}"
    local archive_rtk_version="${RTK_VERSION:-}"

    local installed_info
    installed_info="$(get_installed_versions)"
    local installed_pi_version=""
    local installed_node_version=""
    local installed_manifest_hash=""
    local installed_rtk_version=""
    IFS=$'\t' read -r installed_pi_version installed_node_version installed_manifest_hash installed_rtk_version <<< "$installed_info"

    if [[ "$FORCE_INSTALL" != true && -n "$archive_pi_version" && -n "$installed_pi_version" && "$archive_pi_version" == "$installed_pi_version" && "$archive_node_version" == "$installed_node_version" && "$archive_manifest_hash" == "$installed_manifest_hash" && "$archive_rtk_version" == "$installed_rtk_version" ]]; then
        ensure_rtk_installed
        log "✓ pi ${installed_pi_version} with Node ${installed_node_version} is already installed (package set unchanged)"
        exit 0
    fi

    log "Installing archive: $(basename "$ARCHIVE_PATH")"
    install_archive
    verify_installation

    log "✅ pi offline update completed"
}

main "$@"
