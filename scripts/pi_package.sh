#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DOTFILES_DIR="$(dirname "$SCRIPT_DIR")"
SETTINGS_PATH="${PI_SETTINGS_PATH:-$DOTFILES_DIR/dot/.pi/agent/settings.json}"
MANIFEST_PATH="${PI_OFFLINE_MANIFEST:-}"
PACKAGE_SOURCE_MODE="${PI_OFFLINE_MANIFEST:+manifest}"
if [[ -z "$PACKAGE_SOURCE_MODE" ]]; then
    PACKAGE_SOURCE_MODE="settings"
fi
DEFAULT_POOL_DIR="/mnt/ch03pool/murten_mirror/shannon/linux/tools/pi"
POOL_DIR="${PI_ARCHIVES_DIR:-$DEFAULT_POOL_DIR}"
OUTPUT_DIR="$PWD"
PUBLISH=true
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
PACKAGE_NAME="pi-offline-${TIMESTAMP}.tar.gz"
PACKAGE_OUTPUT_PATH=""
DEFAULT_NODE_VERSION="22.19.0"
DEFAULT_RTK_VERSION="0.42.4"
DEFAULT_RTK_TARGET="x86_64-unknown-linux-musl"
NODE_VERSION="${PI_NODE_VERSION:-}"
RTK_VERSION="${PI_RTK_VERSION:-$DEFAULT_RTK_VERSION}"
RTK_TARGET="${PI_RTK_TARGET:-$DEFAULT_RTK_TARGET}"
RTK_ARCHIVE_NAME="${PI_RTK_ARCHIVE_NAME:-rtk-${RTK_TARGET}.tar.gz}"
RTK_DOWNLOAD_URL="${PI_RTK_DOWNLOAD_URL:-https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}/${RTK_ARCHIVE_NAME}}"
TEMP_DIR=""
STAGE_DIR=""
PACKAGE_SPECS=()
NPM_BIN=""
NODE_BIN=""
PI_PACKAGE_DIR=""
PI_VERSION=""
PI_NODE_ENGINE=""
PI_MIN_NODE_VERSION=""
MANIFEST_HASH=""
PACKAGE_SOURCE_KIND=""
PACKAGE_SOURCE_PATH=""
BUNDLE_RTK="${PI_BUNDLE_RTK:-true}"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

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

Create an offline pi bundle containing:
- a bundled Node runtime compatible with the installed pi CLI
- the pi CLI package and its dependencies
- packages from Pi settings.json pre-installed into bundled global npm
- a bundled RTK tool so Pi's RTK-accelerated tools work offline
- an install.sh helper for target machines without npm access

Options:
  --settings PATH       Pi settings file to read packages from (default: $SETTINGS_PATH)
  --manifest PATH       Deprecated override: read packages from an offline manifest instead of settings.json
  --node-version VER    Override bundled Node version (default from pi's minimum supported version)
  --pool-dir DIR        Publish archive to DIR (default: $DEFAULT_POOL_DIR)
  --no-publish          Keep the archive in output_directory instead of moving it to the pool
  --no-rtk              Do not bundle RTK (not recommended; Pi will fall back to slower built-ins)
  --help, -h            Show this help message

Arguments:
  output_directory      Directory to save the package before publish (default: current directory)

Default package source ($SETTINGS_PATH):
{
  "packages": [
    "npm:@scope/pi-package@1.2.3",
    "git:github.com/user/repo@v1"
  ]
}

Deprecated manifest override format:
{
  "nodeVersion": "$DEFAULT_NODE_VERSION",
  "packages": [
    { "source": "npm:@scope/pi-package@1.2.3" },
    { "source": "git:github.com/user/repo@v1", "name": "my-package" }
  ]
}

Supported package sources:
- npm:   npm:@scope/pkg@1.2.3
- git:   git:github.com/user/repo@v1, https://github.com/user/repo@v1, ssh://git@host/repo@v1
- local: /absolute/path/to/package or ./relative/path/to/package

Examples:
  $(basename "$0")
  $(basename "$0") --settings ~/.pi/agent/settings.json --no-publish /tmp
  $(basename "$0") --node-version $DEFAULT_NODE_VERSION --pool-dir /srv/mirror/pi
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
    for cmd in curl tar git npm node find; do
        ensure_command "$cmd"
    done
    log "✓ Dependencies available"
}

load_package_specs() {
    local source_path
    local source_kind

    if [[ "$PACKAGE_SOURCE_MODE" == "manifest" ]]; then
        [[ -n "$MANIFEST_PATH" ]] || error "Manifest path not set"
        source_path="$MANIFEST_PATH"
        source_kind="manifest"
    else
        source_path="$SETTINGS_PATH"
        source_kind="settings"
    fi

    [[ -f "$source_path" ]] || error "Package source not found: $source_path"

    PACKAGE_SOURCE_KIND="$source_kind"
    PACKAGE_SOURCE_PATH="$source_path"
    PACKAGE_SPECS=()

    local package_info
    package_info=$(node - "$source_kind" "$source_path" <<'NODE'
const fs = require("fs");
const crypto = require("crypto");
const [kind, sourcePath] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const rawPackages = Array.isArray(data.packages) ? data.packages : [];
const packages = rawPackages.map((item, index) => {
  if (typeof item === "string") return { source: item, name: "" };
  if (item && typeof item === "object" && item.source) {
    return { source: String(item.source), name: item.name ? String(item.name) : "" };
  }
  throw new Error(`Invalid package entry at packages[${index}] in ${sourcePath}`);
});
const normalizedPackages = packages.map((pkg) =>
  pkg.name ? { source: pkg.source, name: pkg.name } : pkg.source
);
const packageHash = crypto
  .createHash("sha256")
  .update(JSON.stringify({ packages: normalizedPackages }))
  .digest("hex");
console.log(`NODE_VERSION=${kind === "manifest" ? data.nodeVersion || "" : ""}`);
console.log(`MANIFEST_HASH=${packageHash}`);
for (const pkg of packages) {
  console.log(`PACKAGE=${pkg.source}\t${pkg.name}`);
}
NODE
)

    local manifest_node_version=""
    while IFS= read -r line; do
        [[ -n "$line" ]] || continue
        if [[ "$line" == NODE_VERSION=* ]]; then
            manifest_node_version="${line#NODE_VERSION=}"
        elif [[ "$line" == MANIFEST_HASH=* ]]; then
            MANIFEST_HASH="${line#MANIFEST_HASH=}"
        elif [[ "$line" == PACKAGE=* ]]; then
            PACKAGE_SPECS+=("${line#PACKAGE=}")
        fi
    done <<< "$package_info"

    if [[ "$source_kind" == "manifest" && -z "$NODE_VERSION" && -n "$manifest_node_version" ]]; then
        NODE_VERSION="$manifest_node_version"
    fi

    if [[ ${#PACKAGE_SPECS[@]} -eq 0 ]]; then
        log "Package source contains no third-party packages; bundle will only include pi itself"
    fi
}

resolve_pi_package_dir() {
    if command -v npm >/dev/null 2>&1; then
        local npm_root
        npm_root="$(npm root -g 2>/dev/null || true)"
        if [[ -n "$npm_root" ]]; then
            local candidate="$npm_root/@earendil-works/pi-coding-agent"
            if [[ -d "$candidate" ]]; then
                printf '%s\n' "$candidate"
                return 0
            fi
        fi
    fi

    local bundled_candidate="$HOME/.local/share/pi-runtime/pi"
    if [[ -d "$bundled_candidate" ]]; then
        printf '%s\n' "$bundled_candidate"
        return 0
    fi

    error "Could not locate @earendil-works/pi-coding-agent. Install pi first on the packaging machine."
}

read_json_field() {
    local json_file="$1"
    local field="$2"
    node - "$json_file" "$field" <<'NODE'
const fs = require("fs");
const [jsonFile, field] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
const value = data[field];
if (value === undefined || value === null) {
  process.exit(1);
}
process.stdout.write(String(value));
NODE
}

load_pi_package_metadata() {
    PI_PACKAGE_DIR="$(resolve_pi_package_dir)"
    [[ -f "$PI_PACKAGE_DIR/package.json" ]] || error "pi package.json not found in $PI_PACKAGE_DIR"

    local pi_info
    pi_info=$(node - "$PI_PACKAGE_DIR/package.json" <<'NODE'
const fs = require("fs");
const packageJsonPath = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const engine = pkg.engines && pkg.engines.node ? String(pkg.engines.node) : "";
const minMatch =
  engine.match(/>=\s*v?(\d+(?:\.\d+){0,2})/) ||
  engine.match(/^\s*v?(\d+(?:\.\d+){0,2})\s*$/) ||
  engine.match(/\^\s*v?(\d+(?:\.\d+){0,2})/) ||
  engine.match(/~\s*v?(\d+(?:\.\d+){0,2})/);

console.log(`PI_VERSION=${pkg.version || ""}`);
console.log(`PI_NODE_ENGINE=${engine}`);
console.log(`PI_MIN_NODE_VERSION=${minMatch ? minMatch[1] : ""}`);
NODE
)

    PI_VERSION=""
    PI_NODE_ENGINE=""
    PI_MIN_NODE_VERSION=""

    while IFS= read -r line; do
        [[ -n "$line" ]] || continue
        if [[ "$line" == PI_VERSION=* ]]; then
            PI_VERSION="${line#PI_VERSION=}"
        elif [[ "$line" == PI_NODE_ENGINE=* ]]; then
            PI_NODE_ENGINE="${line#PI_NODE_ENGINE=}"
        elif [[ "$line" == PI_MIN_NODE_VERSION=* ]]; then
            PI_MIN_NODE_VERSION="${line#PI_MIN_NODE_VERSION=}"
        fi
    done <<< "$pi_info"

    [[ -n "$PI_VERSION" ]] || error "Could not determine pi version from $PI_PACKAGE_DIR/package.json"
}

normalize_semver() {
    local version="${1#v}"
    local major=0
    local minor=0
    local patch=0

    IFS='.' read -r major minor patch <<< "$version"
    printf '%d.%d.%d\n' "${major:-0}" "${minor:-0}" "${patch:-0}"
}

semver_lt() {
    local left right
    left="$(normalize_semver "$1")"
    right="$(normalize_semver "$2")"

    local left_major left_minor left_patch right_major right_minor right_patch
    IFS='.' read -r left_major left_minor left_patch <<< "$left"
    IFS='.' read -r right_major right_minor right_patch <<< "$right"

    if (( left_major != right_major )); then
        (( left_major < right_major ))
        return
    fi

    if (( left_minor != right_minor )); then
        (( left_minor < right_minor ))
        return
    fi

    (( left_patch < right_patch ))
}

resolve_bundled_node_version() {
    if [[ -n "$NODE_VERSION" ]]; then
        return 0
    fi

    if [[ -n "$PI_MIN_NODE_VERSION" ]]; then
        NODE_VERSION="$PI_MIN_NODE_VERSION"
    else
        NODE_VERSION="$DEFAULT_NODE_VERSION"
    fi
}

validate_requested_node_version() {
    if [[ -z "$PI_MIN_NODE_VERSION" ]]; then
        return 0
    fi

    if semver_lt "$NODE_VERSION" "$PI_MIN_NODE_VERSION"; then
        error "Bundled Node $NODE_VERSION is too old for pi $PI_VERSION (requires ${PI_NODE_ENGINE:-">=$PI_MIN_NODE_VERSION"}). Rerun with --node-version $PI_MIN_NODE_VERSION or newer."
    fi
}

sanitize_dir_name() {
    local input="$1"
    local sanitized
    sanitized="$(printf '%s' "$input" | sed -E 's#^@##; s#[^A-Za-z0-9._-]+#-#g; s#-+#-#g; s#^-##; s#-$##')"
    if [[ -z "$sanitized" ]]; then
        sanitized="package"
    fi
    printf '%s\n' "$sanitized"
}

expand_local_source_path() {
    local source="$1"
    local source_dir
    source_dir="$(dirname "$PACKAGE_SOURCE_PATH")"

    if [[ "$source" == ~/* ]]; then
        printf '%s\n' "$HOME/${source#~/}"
    elif [[ "$source" == /* ]]; then
        printf '%s\n' "$source"
    else
        printf '%s\n' "$(realpath -m "$source_dir/$source")"
    fi
}

setup_bundled_node() {
    local download_dir="${XDG_CACHE_HOME:-$HOME/.cache}/pi-offline"
    local node_dist="node-v${NODE_VERSION}-linux-x64"
    local node_archive="$download_dir/${node_dist}.tar.xz"
    local node_url="https://nodejs.org/dist/v${NODE_VERSION}/${node_dist}.tar.xz"

    mkdir -p "$download_dir"

    if [[ ! -f "$node_archive" ]]; then
        log "Downloading Node ${NODE_VERSION} from $node_url"
        curl -fsSL "$node_url" -o "$node_archive"
    else
        log "Using cached Node archive: $node_archive"
    fi

    mkdir -p "$STAGE_DIR"
    tar -xJf "$node_archive" -C "$STAGE_DIR"
    mv "$STAGE_DIR/$node_dist" "$STAGE_DIR/node"

    NODE_BIN="$STAGE_DIR/node/bin/node"
    NPM_BIN="$STAGE_DIR/node/bin/npm"

    [[ -x "$NODE_BIN" ]] || error "Bundled node executable not found after extraction"
    [[ -x "$NPM_BIN" ]] || error "Bundled npm executable not found after extraction"
}

find_existing_rtk_binary() {
    local explicit_path="${PI_RTK_PATH:-}"
    local candidate=""

    for candidate in "$explicit_path" "$(command -v rtk 2>/dev/null || true)" "$HOME/.local/bin/rtk"; do
        [[ -n "$candidate" && -x "$candidate" ]] || continue

        local resolved_candidate="$candidate"
        if grep -q 'node/bin/rtk' "$candidate" 2>/dev/null; then
            resolved_candidate="$HOME/.local/share/pi-runtime/node/bin/rtk"
            [[ -x "$resolved_candidate" ]] || continue
        fi

        local version_output
        version_output="$("$resolved_candidate" --version 2>/dev/null || true)"
        [[ -n "$version_output" ]] || continue

        if [[ "$version_output" == *"$RTK_VERSION"* ]]; then
            printf '%s\n' "$resolved_candidate"
            return 0
        fi
    done

    return 1
}

install_rtk_into_bundled_runtime() {
    [[ "$BUNDLE_RTK" == true ]] || return 0

    mkdir -p "$STAGE_DIR/node/bin"

    local existing_rtk
    existing_rtk="$(find_existing_rtk_binary || true)"
    if [[ -n "$existing_rtk" ]]; then
        log "Bundling existing RTK ${RTK_VERSION}: $existing_rtk"
        cp "$existing_rtk" "$STAGE_DIR/node/bin/rtk"
        chmod +x "$STAGE_DIR/node/bin/rtk"
        return 0
    fi

    local download_dir="${XDG_CACHE_HOME:-$HOME/.cache}/pi-offline"
    local rtk_archive="$download_dir/${RTK_ARCHIVE_NAME}"
    local extract_dir="$TEMP_DIR/rtk-extract"

    mkdir -p "$download_dir"

    if [[ ! -f "$rtk_archive" ]]; then
        log "Downloading RTK ${RTK_VERSION} from $RTK_DOWNLOAD_URL"
        curl -fsSL "$RTK_DOWNLOAD_URL" -o "$rtk_archive"
    else
        log "Using cached RTK archive: $rtk_archive"
    fi

    rm -rf "$extract_dir"
    mkdir -p "$extract_dir"
    tar -xzf "$rtk_archive" -C "$extract_dir"

    local rtk_bin="$extract_dir/rtk"
    if [[ ! -x "$rtk_bin" ]]; then
        rtk_bin="$(find "$extract_dir" -type f -name rtk -perm -u+x | head -1)"
    fi
    [[ -n "$rtk_bin" && -x "$rtk_bin" ]] || error "Bundled RTK executable not found after extraction"

    cp "$rtk_bin" "$STAGE_DIR/node/bin/rtk"
    chmod +x "$STAGE_DIR/node/bin/rtk"
}

fetch_npm_source() {
    local source="$1"
    local dest="$2"
    local spec="${source#npm:}"
    local work_dir="$TEMP_DIR/npm-pack-$(date +%s%N)"

    mkdir -p "$work_dir" "$dest"
    local tarball
    tarball="$(
        cd "$work_dir"
        "$NPM_BIN" pack --silent "$spec" | tail -n 1
    )"
    [[ -n "$tarball" ]] || error "npm pack produced no tarball for $source"

    tar -xzf "$work_dir/$tarball" -C "$dest" --strip-components=1
}

parse_git_source() {
    local source="$1"
    local value="$source"
    [[ "$value" == git:* ]] && value="${value#git:}"

    local candidate_ref="${value##*@}"
    local repo="$value"
    local ref=""

    if [[ "$candidate_ref" != "$value" && "$candidate_ref" != *"/"* && "$candidate_ref" != *":"* ]]; then
        repo="${value%@$candidate_ref}"
        ref="$candidate_ref"
    fi

    if [[ "$repo" != *"://"* && "$repo" != git@* ]]; then
        repo="https://$repo"
    fi

    printf '%s\t%s\n' "$repo" "$ref"
}

fetch_git_source() {
    local source="$1"
    local dest="$2"
    local parsed
    parsed="$(parse_git_source "$source")"
    local repo_url="${parsed%%$'\t'*}"
    local ref="${parsed#*$'\t'}"

    log "Cloning $repo_url${ref:+ @ $ref}"
    git clone "$repo_url" "$dest"
    if [[ -n "$ref" ]]; then
        (
            cd "$dest"
            git checkout "$ref"
        )
    fi
    rm -rf "$dest/.git"
}

fetch_local_source() {
    local source="$1"
    local dest="$2"
    local local_path
    local_path="$(expand_local_source_path "$source")"

    [[ -e "$local_path" ]] || error "Local package source not found: $local_path"
    mkdir -p "$dest"

    if [[ -d "$local_path" ]]; then
        cp -a "$local_path"/. "$dest"/
        rm -rf "$dest/.git"
    else
        mkdir -p "$dest/extensions"
        cp -a "$local_path" "$dest/extensions/$(basename "$local_path")"
    fi
}

fetch_package_source() {
    local source="$1"
    local dest="$2"

    if [[ "$source" == npm:* ]]; then
        fetch_npm_source "$source" "$dest"
    elif [[ "$source" == git:* || "$source" == http://* || "$source" == https://* || "$source" == ssh://* || "$source" == git://* ]]; then
        fetch_git_source "$source" "$dest"
    else
        fetch_local_source "$source" "$dest"
    fi
}

copy_pi_runtime() {
    [[ -n "$PI_PACKAGE_DIR" ]] || load_pi_package_metadata

    PACKAGE_NAME="pi-v${PI_VERSION}-node${NODE_VERSION}-offline-${TIMESTAMP}.tar.gz"
    PACKAGE_OUTPUT_PATH="$OUTPUT_DIR/$PACKAGE_NAME"

    log "Copying pi package from $PI_PACKAGE_DIR"
    mkdir -p "$STAGE_DIR/pi"
    cp -a "$PI_PACKAGE_DIR"/. "$STAGE_DIR/pi"/
}

expose_pi_peer_packages() {
    local global_root="$STAGE_DIR/node/lib/node_modules"
    mkdir -p "$global_root/@earendil-works" "$global_root/@sinclair"

    ln -sfn "../../../../pi" "$global_root/@earendil-works/pi-coding-agent"
    ln -sfn "../../../../pi/node_modules/@earendil-works/pi-ai" "$global_root/@earendil-works/pi-ai"
    ln -sfn "../../../../pi/node_modules/@earendil-works/pi-agent-core" "$global_root/@earendil-works/pi-agent-core"
    ln -sfn "../../../../pi/node_modules/@earendil-works/pi-tui" "$global_root/@earendil-works/pi-tui"
    ln -sfn "../../../../pi/node_modules/@sinclair/typebox" "$global_root/@sinclair/typebox"
}

verify_bundled_pi_runtime() {
    local verify_log="$TEMP_DIR/pi-startup-check.log"
    mkdir -p "$TEMP_DIR/home"

    log "Verifying bundled Node ${NODE_VERSION} can start pi ${PI_VERSION}"
    if HOME="$TEMP_DIR/home" \
        PATH="$STAGE_DIR/node/bin:${PATH}" \
        NPM_CONFIG_PREFIX="$STAGE_DIR/node" \
        npm_config_prefix="$STAGE_DIR/node" \
        "$NODE_BIN" "$STAGE_DIR/pi/dist/cli.js" --help >"$verify_log" 2>&1; then
        log "✓ Bundled pi runtime startup check passed"
        return 0
    fi

    cat "$verify_log" >&2
    error "Bundled Node ${NODE_VERSION} failed to start pi ${PI_VERSION}. pi requires ${PI_NODE_ENGINE:-a newer Node version}; rerun with --node-version ${PI_MIN_NODE_VERSION:-$DEFAULT_NODE_VERSION} or newer."
}

ensure_installable_package_json() {
    local package_root="$1"
    local fallback_name="$2"

    if [[ -f "$package_root/package.json" ]]; then
        return 0
    fi

    log "Generating minimal package.json for $(basename "$package_root")"
    node - "$package_root" "$fallback_name" <<'NODE'
const fs = require("fs");
const path = require("path");
const [root, fallbackName] = process.argv.slice(2);
const entries = fs.readdirSync(root, { withFileTypes: true });
const pi = {};

const hasDir = (name) => fs.existsSync(path.join(root, name));
const topLevelFiles = (pattern) =>
  entries
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => `./${entry.name}`);

if (hasDir("extensions")) {
  pi.extensions = ["./extensions"];
} else {
  const extensionFiles = topLevelFiles(/\.(?:[cm]?js|tsx?)$/);
  if (extensionFiles.length) pi.extensions = extensionFiles;
}
if (hasDir("skills")) pi.skills = ["./skills"];
if (hasDir("prompts")) pi.prompts = ["./prompts"];
if (hasDir("themes")) pi.themes = ["./themes"];

if (Object.keys(pi).length === 0) {
  throw new Error(`Cannot create package.json for ${root}: no conventional pi resources found`);
}

const sanitize = (value) =>
  (value || "package")
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "") || "package";

const pkg = {
  name: sanitize(fallbackName),
  version: "0.0.0-offline",
  private: true,
  keywords: ["pi-package"],
  pi,
};

fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
NODE
}

install_package_into_bundled_npm() {
    local package_root="$1"
    local label="$2"

    ensure_installable_package_json "$package_root" "$label"

    local tarball
    tarball="$(
        cd "$package_root"
        npm_config_cache="$TEMP_DIR/npm-cache" \
        npm_config_audit=false \
        npm_config_fund=false \
        "$NPM_BIN" pack --silent | tail -n 1
    )"
    [[ -n "$tarball" ]] || error "npm pack failed for $label"

    local tarball_path="$package_root/$tarball"
    [[ -f "$tarball_path" ]] || error "Packed tarball not found for $label: $tarball_path"

    log "Installing $label into bundled global npm"
    npm_config_cache="$TEMP_DIR/npm-cache" \
    npm_config_audit=false \
    npm_config_fund=false \
    "$NPM_BIN" install -g --omit=dev --prefix "$STAGE_DIR/node" "$tarball_path"

    rm -f "$tarball_path"
}

install_manifest_packages() {
    if [[ ${#PACKAGE_SPECS[@]} -eq 0 ]]; then
        return 0
    fi

    local index=0
    for spec in "${PACKAGE_SPECS[@]}"; do
        local source="${spec%%$'\t'*}"
        local requested_name="${spec#*$'\t'}"
        [[ -n "$source" ]] || continue
        index=$((index + 1))

        local work_root="$TEMP_DIR/package-$index"
        fetch_package_source "$source" "$work_root"

        local package_json="$work_root/package.json"
        local package_name="$requested_name"
        if [[ -z "$package_name" && -f "$package_json" ]]; then
            package_name="$(read_json_field "$package_json" name 2>/dev/null || true)"
        fi
        if [[ -z "$package_name" ]]; then
            package_name="package-$index"
        fi

        install_package_into_bundled_npm "$work_root" "$package_name"
    done
}

create_manifest_files() {
    local manifest_rtk_version=""
    local manifest_rtk_target=""
    local manifest_rtk_archive_name=""

    if [[ "$BUNDLE_RTK" == true ]]; then
        manifest_rtk_version="$RTK_VERSION"
        manifest_rtk_target="$RTK_TARGET"
        manifest_rtk_archive_name="$RTK_ARCHIVE_NAME"
    fi

    cat > "$TEMP_DIR/manifest.env" <<EOF
PI_VERSION='$PI_VERSION'
NODE_VERSION='$NODE_VERSION'
PI_NODE_ENGINE='$PI_NODE_ENGINE'
PI_MIN_NODE_VERSION='$PI_MIN_NODE_VERSION'
CREATED_AT='$CREATED_AT'
MANIFEST_HASH='$MANIFEST_HASH'
PACKAGE_SOURCE_KIND='$PACKAGE_SOURCE_KIND'
PACKAGE_SOURCE_PATH='$PACKAGE_SOURCE_PATH'
RTK_VERSION='$manifest_rtk_version'
RTK_TARGET='$manifest_rtk_target'
RTK_ARCHIVE_NAME='$manifest_rtk_archive_name'
EOF

    cp "$TEMP_DIR/manifest.env" "$STAGE_DIR/manifest.env"
    node - "$STAGE_DIR/offline-packages.json" "$PACKAGE_SOURCE_KIND" "$PACKAGE_SOURCE_PATH" "$NODE_VERSION" "${PACKAGE_SPECS[@]}" <<'NODE'
const fs = require("fs");
const [outPath, sourceKind, sourcePath, nodeVersion, ...specs] = process.argv.slice(2);
const packages = specs.map((spec) => {
  const [source, name = ""] = spec.split("\t");
  return name ? { source, name } : source;
});
const manifest = {
  generated: true,
  source: {
    kind: sourceKind,
    path: sourcePath,
  },
  nodeVersion,
  packages,
};
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
}

create_install_script() {
    cat > "$TEMP_DIR/install.sh" <<'EOF'
#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_RUNTIME_DIR="$SCRIPT_DIR/pi-runtime"
TARGET_RUNTIME_DIR="$HOME/.local/share/pi-runtime"
TARGET_BIN_DIR="$HOME/.local/bin"
STAGING_DIR="${TARGET_RUNTIME_DIR}.tmp.$$"

if [[ ! -d "$SOURCE_RUNTIME_DIR" ]]; then
    echo "ERROR: Could not find pi-runtime directory next to install.sh" >&2
    exit 1
fi

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR" "$TARGET_BIN_DIR"
cp -a "$SOURCE_RUNTIME_DIR"/. "$STAGING_DIR"/
rm -rf "$TARGET_RUNTIME_DIR"
mkdir -p "$(dirname "$TARGET_RUNTIME_DIR")"
mv "$STAGING_DIR" "$TARGET_RUNTIME_DIR"

cat > "$TARGET_BIN_DIR/pi" <<'WRAPPER'
#!/usr/bin/env bash
set -Eeuo pipefail
RUNTIME_DIR="${HOME}/.local/share/pi-runtime"
export PATH="${RUNTIME_DIR}/node/bin:${PATH}"
export NPM_CONFIG_PREFIX="${RUNTIME_DIR}/node"
export npm_config_prefix="${RUNTIME_DIR}/node"
exec "${RUNTIME_DIR}/node/bin/node" "${RUNTIME_DIR}/pi/dist/cli.js" "$@"
WRAPPER
chmod +x "$TARGET_BIN_DIR/pi"

if [[ -x "$TARGET_RUNTIME_DIR/node/bin/rtk" ]]; then
    cat > "$TARGET_BIN_DIR/rtk" <<'RTK_WRAPPER'
#!/usr/bin/env bash
set -Eeuo pipefail
RUNTIME_DIR="${HOME}/.local/share/pi-runtime"
exec "${RUNTIME_DIR}/node/bin/rtk" "$@"
RTK_WRAPPER
    chmod +x "$TARGET_BIN_DIR/rtk"
elif [[ -f "$TARGET_BIN_DIR/rtk" ]] && grep -q 'node/bin/rtk' "$TARGET_BIN_DIR/rtk" 2>/dev/null; then
    rm -f "$TARGET_BIN_DIR/rtk"
fi

if [[ -f "$TARGET_RUNTIME_DIR/manifest.env" ]]; then
    # shellcheck disable=SC1090
    source "$TARGET_RUNTIME_DIR/manifest.env"
    echo "Installed pi ${PI_VERSION:-unknown} with bundled Node ${NODE_VERSION:-unknown}"
    if [[ -n "${RTK_VERSION:-}" && -x "$TARGET_RUNTIME_DIR/node/bin/rtk" ]]; then
        echo "Installed bundled RTK ${RTK_VERSION}"
    fi
fi

echo "pi runtime installed to: $TARGET_RUNTIME_DIR"
echo "pi wrapper installed to: $TARGET_BIN_DIR/pi"
if [[ -x "$TARGET_BIN_DIR/rtk" ]]; then
    echo "rtk wrapper installed to: $TARGET_BIN_DIR/rtk"
fi
if [[ ":$PATH:" != *":$TARGET_BIN_DIR:"* ]]; then
    echo "WARNING: $TARGET_BIN_DIR is not in PATH. Add this to your shell profile:" >&2
    echo "  export PATH=\"$TARGET_BIN_DIR:\$PATH\"" >&2
fi
EOF
    chmod +x "$TEMP_DIR/install.sh"
}

create_readme() {
    local package_basename="$PACKAGE_NAME"
    local bundled_rtk_metadata="not included"
    if [[ "$BUNDLE_RTK" == true ]]; then
        bundled_rtk_metadata="${RTK_VERSION} (${RTK_TARGET})"
    fi

    cat > "$TEMP_DIR/README.md" <<EOF
# pi Offline Package

This archive contains an offline pi runtime bundle.

## Contents

- the pi CLI package and its dependencies under \`pi-runtime/pi/\`
- a bundled Node ${NODE_VERSION} runtime under \`pi-runtime/node/\`
- configured Pi packages pre-installed into bundled global npm under \`pi-runtime/node/lib/node_modules/\`
- a bundled RTK binary under \`pi-runtime/node/bin/rtk\` so Pi can use RTK offline
- \`install.sh\` to install the bundle on a machine without npm access

## Installation

\`\`\`bash
tar -xzf ${package_basename}
cd <extract-dir>
./install.sh
\`\`\`

## Runtime Layout

After installation, the runtime lives in:

- \`~/.local/share/pi-runtime\`
- wrapper: \`~/.local/bin/pi\`
- wrapper: \`~/.local/bin/rtk\` when RTK is bundled

The wrapper prepends the bundled Node/npm to \`PATH\` and points npm's global prefix at the bundled runtime.
That means you can keep normal pi package settings; the offline bundle pre-installs configured packages into that bundled npm prefix.

## Package Metadata

- pi version: ${PI_VERSION}
- Node version: ${NODE_VERSION}
- pi Node requirement: ${PI_NODE_ENGINE:-unknown}
- bundled RTK: ${bundled_rtk_metadata}
- created at: ${CREATED_AT}
- package source: ${PACKAGE_SOURCE_KIND} (${PACKAGE_SOURCE_PATH})
- package hash: ${MANIFEST_HASH}
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
    [[ -d "$pool_parent" ]] || error "Pool parent directory not accessible: $pool_parent"
    mkdir -p "$POOL_DIR"

    log "Publishing archive to $POOL_DIR"
    mv "$PACKAGE_OUTPUT_PATH" "$POOL_DIR/"
    PACKAGE_OUTPUT_PATH="$POOL_DIR/$PACKAGE_NAME"

    log "Cleaning up older pi archives in $POOL_DIR"
    local old_archives
    old_archives=$(find "$POOL_DIR" -maxdepth 1 -name 'pi-v*-node*-offline-*.tar.gz' -type f ! -name "$PACKAGE_NAME" 2>/dev/null || true)
    if [[ -n "$old_archives" ]]; then
        while IFS= read -r old_archive; do
            [[ -n "$old_archive" && -f "$old_archive" ]] || continue
            log "Removing older archive: $(basename "$old_archive")"
            rm -f "$old_archive"
        done <<< "$old_archives"
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --settings)
                SETTINGS_PATH="$2"
                PACKAGE_SOURCE_MODE="settings"
                shift 2
                ;;
            --manifest)
                MANIFEST_PATH="$2"
                PACKAGE_SOURCE_MODE="manifest"
                shift 2
                ;;
            --node-version)
                NODE_VERSION="$2"
                shift 2
                ;;
            --pool-dir)
                POOL_DIR="$2"
                shift 2
                ;;
            --no-publish)
                PUBLISH=false
                shift
                ;;
            --no-rtk)
                BUNDLE_RTK=false
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
    load_package_specs
    load_pi_package_metadata
    resolve_bundled_node_version
    validate_requested_node_version

    [[ -d "$OUTPUT_DIR" ]] || error "Output directory does not exist: $OUTPUT_DIR"
    OUTPUT_DIR="$(realpath "$OUTPUT_DIR")"

    TEMP_DIR="$(mktemp -d)"
    trap cleanup EXIT
    STAGE_DIR="$TEMP_DIR/pi-runtime"

    log "Preparing offline pi bundle"
    log "Package source: $PACKAGE_SOURCE_KIND ($PACKAGE_SOURCE_PATH)"
    log "pi version: $PI_VERSION"
    if [[ -n "$PI_NODE_ENGINE" ]]; then
        log "pi Node requirement: $PI_NODE_ENGINE"
    fi
    log "Bundled Node version: $NODE_VERSION"
    if [[ "$BUNDLE_RTK" == true ]]; then
        log "Bundled RTK version: $RTK_VERSION ($RTK_TARGET)"
    fi

    setup_bundled_node
    copy_pi_runtime
    verify_bundled_pi_runtime
    expose_pi_peer_packages
    install_manifest_packages
    install_rtk_into_bundled_runtime
    create_manifest_files
    create_install_script
    create_readme

    PACKAGE_OUTPUT_PATH="$OUTPUT_DIR/$PACKAGE_NAME"

    log "Creating tarball: $PACKAGE_NAME"
    (
        cd "$TEMP_DIR"
        tar -czf "$PACKAGE_OUTPUT_PATH" pi-runtime install.sh README.md manifest.env
    )

    publish_archive

    local package_size
    package_size="$(du -h "$PACKAGE_OUTPUT_PATH" | cut -f1)"

    log "Package created successfully"
    log "Location: $PACKAGE_OUTPUT_PATH"
    log "Size: $package_size"
    log "pi version: $PI_VERSION"
    log "Bundled Node version: $NODE_VERSION"
    if [[ "$BUNDLE_RTK" == true ]]; then
        log "Bundled RTK version: $RTK_VERSION"
    fi
}

main "$@"
