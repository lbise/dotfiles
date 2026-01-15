#!/usr/bin/env bash

set -euo pipefail

# Script to package and install opencode for offline deployment
# Can package from local machine (default) or Docker container
# Usage: ./devenv_package.sh [OPTIONS] [output_directory]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${PWD}"
CONTAINER_NAME="opencode-package-temp"
IMAGE_NAME=""
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="opencode-offline-${TIMESTAMP}.tar.gz"
INSTALL_MODE=false
INSTALL_PACKAGE=""
LOCAL_MODE=true

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

install_package() {
    local package_file="$1"

    if [[ ! -f "$package_file" ]]; then
        error "Package file does not exist: $package_file"
    fi

    log "Installing opencode from package: $package_file"

    # Create temporary directory for extraction
    local temp_dir=$(mktemp -d)
    trap "rm -rf '$temp_dir'" EXIT

    # Extract package
    log "Extracting package..."
    tar -xzf "$package_file" -C "$temp_dir"

    # Check if extraction was successful
    if [[ ! -f "$temp_dir/install.sh" ]]; then
        error "Invalid package: install.sh not found"
    fi

    # Run installation
    log "Running installation..."
    cd "$temp_dir"
    ./install.sh

    log "Installation completed successfully!"
    log "opencode is now available at ~/.opencode/bin/opencode"

    # Test installation
    if command -v opencode >/dev/null 2>&1; then
        local version=$(opencode --version 2>/dev/null || echo "unknown")
        log "✓ opencode is available in PATH (version: $version)"
    else
        log "⚠ opencode not found in PATH. Restart your shell or run:"
        log "  export PATH=\"\$HOME/.opencode/bin:\$PATH\""
    fi
}

package_local() {
    local temp_dir="$1"

    log "Packaging opencode from local machine..."

    # Find opencode executable
    local opencode_path=""
    if command -v opencode >/dev/null 2>&1; then
        opencode_path=$(which opencode)
        log "Found opencode at: $opencode_path"
    else
        # Check common locations
        for path in "$HOME/.opencode/bin/opencode" "/usr/local/bin/opencode" "/usr/bin/opencode"; do
            if [[ -f "$path" && -x "$path" ]]; then
                opencode_path="$path"
                log "Found opencode at: $opencode_path"
                break
            fi
        done
    fi

    if [[ -z "$opencode_path" ]]; then
        error "opencode executable not found on local machine. Please install opencode first."
    fi

    # Create directory structure
    mkdir -p "$temp_dir/.opencode/bin"
    mkdir -p "$temp_dir/.cache"

    # Copy opencode executable
    log "Copying opencode executable..."
    if [[ -L "$opencode_path" ]]; then
        # Resolve symlink
        local real_path=$(readlink -f "$opencode_path")
        log "Resolving symlink to: $real_path"
        cp "$real_path" "$temp_dir/.opencode/bin/opencode"
    else
        cp "$opencode_path" "$temp_dir/.opencode/bin/opencode"
    fi
    chmod +x "$temp_dir/.opencode/bin/opencode"

    # Get opencode version and update package name
    log "Getting opencode version..."
    local opencode_version=$("$opencode_path" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    log "OpenCode version: $opencode_version"

    # Update package name with version
    if [[ "$opencode_version" != "unknown" ]]; then
        PACKAGE_NAME="opencode-v${opencode_version}-offline-${TIMESTAMP}.tar.gz"
        OUTPUT_PATH="$OUTPUT_DIR/$PACKAGE_NAME"
        log "Updated package name: $PACKAGE_NAME"
    fi

    # Copy cached dependencies (only from ~/.cache/opencode)
    log "Copying cached dependencies..."
    local cache_found=false
    if [[ -d "$HOME/.cache/opencode" ]]; then
        log "Found cache directory: $HOME/.cache/opencode"
        cp -r "$HOME/.cache/opencode" "$temp_dir/.cache/"
        cache_found=true
    fi

    if [[ "$cache_found" == false ]]; then
        log "WARNING: No cached dependencies found at ~/.cache/opencode. Creating empty cache directory."
        mkdir -p "$temp_dir/.cache/opencode"
    fi
}

package_container() {
    local temp_dir="$1"

    log "Packaging opencode from Docker container..."

    # Auto-detect image if not specified and no container name given
    if [[ -z "$IMAGE_NAME" && "$CONTAINER_NAME" == "opencode-package-temp" ]]; then
        log "Auto-detecting Docker image with opencode..."

        # Look for images that likely contain opencode
        local candidate_images=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "(devenv|opencode)" | grep -v "<none>" | head -5)

        if [[ -z "$candidate_images" ]]; then
            error "No suitable Docker images found. Please specify with --image or --container, or build a container with opencode installed."
        fi

        log "Found candidate images:"
        echo "$candidate_images" | while read -r img; do
            log "  - $img"
        done

        # Use the first (most recent) candidate
        IMAGE_NAME=$(echo "$candidate_images" | head -1)
        log "Using image: $IMAGE_NAME"
    fi

    # Handle container vs image mode
    local using_existing_container=false
    if [[ "$CONTAINER_NAME" != "opencode-package-temp" ]]; then
        # Using existing container
        log "Using existing container: $CONTAINER_NAME"
        using_existing_container=true

        # Check if container exists and is running
        if ! docker container ls -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
            error "Container '$CONTAINER_NAME' not found"
        fi

        # Start container if it's not running
        if ! docker container ls --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
            log "Starting container: $CONTAINER_NAME"
            docker start "$CONTAINER_NAME"
        fi
    else
        # Using image - create temporary container
        if [[ -z "$IMAGE_NAME" ]]; then
            error "No image specified and no suitable images found"
        fi

        # Check if Docker image exists
        if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
            error "Docker image '$IMAGE_NAME' not found. Available images:"
            docker images --format "table {{.Repository}}:{{.Tag}}" | grep -v "<none>"
            exit 1
        fi

        # Start container to extract files
        log "Starting temporary container from image: $IMAGE_NAME"
        docker run -d --name "$CONTAINER_NAME" "$IMAGE_NAME" sleep 3600
    fi

    # Create directory structure
    mkdir -p "$temp_dir/.opencode/bin"
    mkdir -p "$temp_dir/.cache"

    # Copy opencode executable
    log "Copying opencode executable..."
    if docker exec "$CONTAINER_NAME" test -f /usr/local/bin/opencode; then
        # Check if it's a symlink and resolve it
        if docker exec "$CONTAINER_NAME" test -L /usr/local/bin/opencode; then
            log "Resolving symlink..."
            local real_path=$(docker exec "$CONTAINER_NAME" readlink -f /usr/local/bin/opencode)
            log "Real path: $real_path"
            docker cp "$CONTAINER_NAME:$real_path" "$temp_dir/.opencode/bin/opencode"
        else
            docker cp "$CONTAINER_NAME:/usr/local/bin/opencode" "$temp_dir/.opencode/bin/opencode"
        fi
        chmod +x "$temp_dir/.opencode/bin/opencode"

        # Get opencode version and update package name
        log "Getting opencode version..."
        local opencode_version=$(docker exec "$CONTAINER_NAME" opencode --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
        log "OpenCode version: $opencode_version"

        # Update package name with version
        if [[ "$opencode_version" != "unknown" ]]; then
            PACKAGE_NAME="opencode-v${opencode_version}-offline-${TIMESTAMP}.tar.gz"
            OUTPUT_PATH="$OUTPUT_DIR/$PACKAGE_NAME"
            log "Updated package name: $PACKAGE_NAME"
        fi
    else
        error "opencode executable not found in container at /usr/local/bin/opencode"
    fi

    # Copy cached dependencies (only from container's cache directory)
    log "Copying cached dependencies..."
    if docker exec "$CONTAINER_NAME" test -d /home/leodev/.cache/opencode; then
        docker cp "$CONTAINER_NAME:/home/leodev/.cache/opencode" "$temp_dir/.cache/"
    else
        log "WARNING: No cached dependencies found at /home/leodev/.cache/opencode"
        mkdir -p "$temp_dir/.cache/opencode"
    fi

    # Clean up temporary container (only if we created it)
    if [[ "$using_existing_container" == false ]]; then
        trap "docker rm -f '$CONTAINER_NAME' 2>/dev/null || true" EXIT
    fi
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS] [output_directory]

Package opencode with all dependencies for offline deployment.
Can package from local machine (default) or Docker container.
Only packages the binary (~/.opencode/bin/opencode) and cache (~/.cache/opencode).
The ~/.local/share/opencode folder is excluded and left untouched.

Options:
  --package             Create a package (default mode)
  --install PACKAGE     Install from existing package file
  --container NAME      Package from Docker container instead of local machine
  --image IMAGE_NAME    Specify Docker image to use (container mode only)
  --help, -h           Show this help message

Arguments:
  output_directory    Directory to save the package (package mode, default: current directory)

Examples:
  # Package mode (default - from local machine)
  $0                                        # Package from local machine, save to current directory
  $0 /tmp/packages                          # Package from local machine, save to /tmp/packages

  # Package from Docker container
  $0 --container my-devenv-container        # Package from named container
  $0 --image my-devenv:latest /tmp/packages # Package from image, save to /tmp/packages

  # Install mode
  $0 --install opencode-offline-20250901_094359.tar.gz
  $0 --install /path/to/package.tar.gz

Package Output:
  Creates opencode-offline-YYYYMMDD_HHMMSS.tar.gz containing:
  - ~/.opencode/bin/opencode (executable)
  - ~/.cache/opencode/ (cached dependencies)
  Note: ~/.local/share/opencode is excluded and preserved

Install Output:
  Extracts and installs opencode to:
  - ~/.opencode/bin/opencode
  - ~/.cache/opencode/
  - Updates PATH in shell RC file
  Note: ~/.local/share/opencode is left untouched
EOF
}

cleanup() {
    log "Cleaning up..."
    # Only remove temporary containers, not user-specified ones
    if [[ "$CONTAINER_NAME" == "opencode-package-temp" ]]; then
        docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
    fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --package)
            INSTALL_MODE=false
            shift
            ;;
        --install)
            INSTALL_MODE=true
            INSTALL_PACKAGE="$2"
            shift 2
            ;;
        --container)
            LOCAL_MODE=false
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --image)
            LOCAL_MODE=false
            IMAGE_NAME="$2"
            shift 2
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        -*)
            error "Unknown option: $1"
            ;;
        *)
            if [[ $INSTALL_MODE == false ]]; then
                OUTPUT_DIR="$1"
            fi
            shift
            ;;
    esac
done

# Handle install mode
if [[ $INSTALL_MODE == true ]]; then
    if [[ -z "$INSTALL_PACKAGE" ]]; then
        error "Package file required for install mode. Use --install <package_file>"
    fi
    install_package "$INSTALL_PACKAGE"
    exit 0
fi

# Continue with package mode
if [[ $LOCAL_MODE == false ]]; then
    trap cleanup EXIT
fi

# Validate output directory
if [[ ! -d "$OUTPUT_DIR" ]]; then
    error "Output directory does not exist: $OUTPUT_DIR"
fi

# Convert to absolute path
OUTPUT_DIR=$(realpath "$OUTPUT_DIR")
OUTPUT_PATH="$OUTPUT_DIR/$PACKAGE_NAME"

log "Starting opencode packaging process..."
log "Mode: $(if [[ $LOCAL_MODE == true ]]; then echo "Local machine"; else echo "Docker container"; fi)"
log "Output will be saved to: $OUTPUT_PATH"

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
trap "rm -rf '$TEMP_DIR'" EXIT

# Package from appropriate source
if [[ $LOCAL_MODE == true ]]; then
    package_local "$TEMP_DIR"
else
    package_container "$TEMP_DIR"
fi

# Create installation script
log "Creating installation script..."
cat > "$TEMP_DIR/install.sh" << 'EOF'
#!/usr/bin/env bash

set -euo pipefail

INSTALL_DIR="${HOME}/.opencode"
CACHE_DIR="${HOME}/.cache"

echo "Installing opencode offline package..."

# Create directories
mkdir -p "$INSTALL_DIR/bin"
mkdir -p "$CACHE_DIR"

# Copy files
cp -r .opencode/* "$INSTALL_DIR/"
cp -r .cache/* "$CACHE_DIR/"

# Make executable
chmod +x "$INSTALL_DIR/bin/opencode"

# Add to PATH if not already there
SHELL_RC=""
if [[ -f "$HOME/.bashrc" ]]; then
    SHELL_RC="$HOME/.bashrc"
elif [[ -f "$HOME/.zshrc" ]]; then
    SHELL_RC="$HOME/.zshrc"
fi

if [[ -n "$SHELL_RC" ]]; then
    if ! grep -q "\.opencode/bin" "$SHELL_RC"; then
        echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> "$SHELL_RC"
        echo "Added opencode to PATH in $SHELL_RC"
        echo "Run 'source $SHELL_RC' or restart your shell to use opencode"
    fi
fi

echo "Installation complete!"
echo "opencode executable installed to: $INSTALL_DIR/bin/opencode"
echo "Cached dependencies installed to: $CACHE_DIR/opencode"

# Test installation
if command -v opencode >/dev/null 2>&1; then
    echo "✓ opencode is available in PATH"
else
    echo "⚠ opencode not found in PATH. You may need to restart your shell or run:"
    echo "  export PATH=\"\$HOME/.opencode/bin:\$PATH\""
fi
EOF

chmod +x "$TEMP_DIR/install.sh"

# Create README
log "Creating README..."
SOURCE_INFO="Local machine"
if [[ $LOCAL_MODE == false ]]; then
    if [[ -n "$IMAGE_NAME" ]]; then
        SOURCE_INFO="Docker image '$IMAGE_NAME'"
    else
        SOURCE_INFO="Docker container '$CONTAINER_NAME'"
    fi
fi

PACKAGE_BASENAME=$(basename "$PACKAGE_NAME")
CURRENT_DATE=$(date)

cat > "$TEMP_DIR/README.md" << EOF
# OpenCode Offline Package

This package contains a pre-built opencode installation with all dependencies for offline deployment.

## Contents

- \`.opencode/bin/opencode\` - The opencode executable
- \`.cache/opencode/\` - Pre-installed AI SDK dependencies
- \`install.sh\` - Installation script
- \`README.md\` - This file

Note: This package only includes the binary and cache. The ~/.local/share/opencode folder is excluded and will remain untouched during installation.

## Installation

1. Extract this package:
   \`\`\`bash
   tar -xzf $PACKAGE_BASENAME
   cd opencode-offline-*
   \`\`\`

2. Run the installation script:
   \`\`\`bash
   ./install.sh
   \`\`\`

3. Restart your shell or run:
   \`\`\`bash
   source ~/.bashrc  # or ~/.zshrc
   \`\`\`

## Manual Installation

If you prefer manual installation:

1. Copy files to your home directory:
   \`\`\`bash
   cp -r .opencode ~/
   cp -r .cache ~/
   chmod +x ~/.opencode/bin/opencode
   \`\`\`

2. Add to your PATH:
   \`\`\`bash
   export PATH="\\\$HOME/.opencode/bin:\\\$PATH"
   \`\`\`

## Usage

After installation, you can use opencode normally:
\`\`\`bash
opencode --help
opencode auth login
\`\`\`

## Package Info

- Created: $CURRENT_DATE
- Source: $SOURCE_INFO
- Includes pre-cached AI SDK dependencies for offline use
- Excludes ~/.local/share/opencode folder (preserved during installation)
EOF

# Create the tarball
log "Creating tarball: $PACKAGE_NAME"
cd "$TEMP_DIR"
tar -czf "$OUTPUT_PATH" .

# Move to pool
POOL_DIR="/mnt/ch03pool/murten_mirror/shannon/linux/tools/opencode"
if [ ! -d $POOL_DIR ]; then
    log "Pool not accessible, cannot copy archive to $POOL_DIR"
    sudo mount -a
    if [ ! -d $POOL_DIR ]; then
        log "Cannot mount pool, aborting..."
        exit 1
    fi
fi

log "Moving package to $POOL_DIR..."
mv "$OUTPUT_PATH" "$POOL_DIR"
OUTPUT_PATH="$POOL_DIR/$PACKAGE_NAME"

# Remove older archive versions from the pool
log "Cleaning up older archive versions..."
OLDER_ARCHIVES=$(find "$POOL_DIR" -maxdepth 1 -name "opencode-v*-offline-*.tar.gz" -type f ! -name "$PACKAGE_NAME" 2>/dev/null || true)
if [[ -n "$OLDER_ARCHIVES" ]]; then
    echo "$OLDER_ARCHIVES" | while read -r old_archive; do
        if [[ -f "$old_archive" ]]; then
            log "Removing older archive: $(basename "$old_archive")"
            rm -f "$old_archive"
        fi
    done
    log "Cleanup completed"
else
    log "No older archives found to remove"
fi

# Get package size
PACKAGE_SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)

log "Package created successfully!"
log "Location: $OUTPUT_PATH"
log "Size: $PACKAGE_SIZE"
log ""
log "To deploy on offline machine:"
log "1. Copy $PACKAGE_NAME to target machine"
log "2. Extract: tar -xzf $PACKAGE_NAME"
log "3. Run: ./install.sh"
