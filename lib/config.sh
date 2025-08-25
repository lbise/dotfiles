#!/usr/bin/env bash
# YAML configuration parser and utilities
# Simple bash-based YAML parser to avoid external dependencies

# Source common variables and functions
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

CONFIG_DIR="$DOTFILES_DIR/config"

# Simple YAML value extractor using grep and sed
# Usage: get_yaml_value file.yml "path.to.key"
get_yaml_value() {
    local file="$1"
    local key_path="$2"
    local full_path="$CONFIG_DIR/$file"
    
    if [ ! -f "$full_path" ]; then
        echo "Error: Config file not found: $full_path" >&2
        return 1
    fi
    
    # Convert dot notation to grep pattern
    # For now, support simple key lookups
    local key=$(echo "$key_path" | sed 's/.*\.//')
    grep "^[[:space:]]*${key}:" "$full_path" | sed 's/.*: *//' | sed 's/^["'\'']//' | sed 's/["'\'']$//'
}

# Get YAML array values
# Usage: get_yaml_array file.yml "path.to.array"
get_yaml_array() {
    local file="$1"
    local key_path="$2"
    local full_path="$CONFIG_DIR/$file"
    
    if [ ! -f "$full_path" ]; then
        echo "Error: Config file not found: $full_path" >&2
        return 1
    fi
    
    # Simple array extraction - find the key and get subsequent lines starting with -
    local key=$(echo "$key_path" | sed 's/.*\.//')
    awk "
        /^[[:space:]]*${key}:/ { in_array = 1; next }
        in_array && /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*-/ { in_array = 0 }
        in_array && /^[[:space:]]*-/ { 
            gsub(/^[[:space:]]*-[[:space:]]*/, \"\")
            gsub(/[\"']/, \"\")
            print 
        }
    " "$full_path"
}

# Get packages for a specific OS
get_packages_for_os() {
    local os="$1"
    local version="$2"
    local config_file="packages.yml"
    
    echo "# Getting packages for $os" >&2
    
    # First get common packages
    get_yaml_array "$config_file" "common"
    
    # Then get OS-specific additional packages
    awk "
        /^[[:space:]]*${os}:/ { in_os = 1; next }
        in_os && /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*additional/ && !/^[[:space:]]*version_specific/ { in_os = 0 }
        in_os && /^[[:space:]]*additional:/ { in_additional = 1; next }
        in_additional && /^[[:space:]]*version_specific:/ { in_additional = 0 }
        in_additional && /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*-/ { in_additional = 0 }
        in_additional && /^[[:space:]]*-/ { 
            gsub(/^[[:space:]]*-[[:space:]]*/, \"\")
            gsub(/[\"']/, \"\")
            print 
        }
    " "$CONFIG_DIR/$config_file"
    
    # Get version-specific packages if version provided
    if [ -n "$version" ]; then
        awk "
            /^[[:space:]]*${os}:/ { in_os = 1; next }
            in_os && /^[[:space:]]*version_specific:/ { in_version = 1; next }
            in_version && /^[[:space:]]*\"${version}\":/ { in_target_version = 1; next }
            in_target_version && /^[[:space:]]*\"[0-9]/ { in_target_version = 0 }
            in_target_version && /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*-/ { in_target_version = 0 }
            in_target_version && /^[[:space:]]*-/ { 
                gsub(/^[[:space:]]*-[[:space:]]*/, \"\")
                gsub(/[\"']/, \"\")
                print 
            }
        " "$CONFIG_DIR/$config_file"
    fi
}

# Get package manager commands
get_package_manager_command() {
    local os="$1"
    local command="$2"
    local config_file="packages.yml"
    
    # Look under package_managers section
    awk "
        /^[[:space:]]*package_managers:/ { in_managers = 1; next }
        in_managers && /^[[:space:]]*${os}:/ { in_os = 1; next }
        in_managers && in_os && /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*${command}/ { in_os = 0 }
        in_managers && in_os && /^[[:space:]]*${command}:/ { 
            gsub(/^[[:space:]]*${command}:[[:space:]]*\"/, \"\")
            gsub(/\"$/, \"\")
            print 
        }
        /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*package_managers/ { in_managers = 0 }
    " "$CONFIG_DIR/$config_file"
}

# Get symlinks configuration
get_symlinks() {
    local category="$1"
    local config_file="symlinks.yml"
    
    if [ "$category" = "all" ]; then
        # Get all symlink categories
        for cat in core config gpg applications; do
            get_symlinks "$cat"
        done
        return
    fi
    
    # Extract symlinks for specific category
    awk "
        /^[[:space:]]*${category}:/ { in_section = 1; next }
        in_section && /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*\"/ { in_section = 0 }
        in_section && /^[[:space:]]*\".*\":/ { 
            line = \$0
            gsub(/^[[:space:]]*\"/, \"\", line)
            gsub(/\":[[:space:]]*\"/, \"|\", line)
            gsub(/\"$/, \"\", line)
            print line
        }
    " "$CONFIG_DIR/$config_file"
}

# Get software configuration
get_software_config() {
    local software_name="$1"
    local property="$2"
    local config_file="software.yml"
    
    awk "
        /^[[:space:]]*${software_name}:/ { in_section = 1; next }
        in_section && /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*\"/ && !/^[[:space:]]*version/ && !/^[[:space:]]*platform/ && !/^[[:space:]]*archive/ && !/^[[:space:]]*install/ && !/^[[:space:]]*binary/ && !/^[[:space:]]*source/ && !/^[[:space:]]*check/ { in_section = 0 }
        in_section && /^[[:space:]]*${property}:/ { 
            gsub(/^[[:space:]]*${property}:[[:space:]]*/, \"\")
            gsub(/^[\"']/, \"\")
            gsub(/[\"']$/, \"\")
            print 
        }
    " "$CONFIG_DIR/$config_file"
}

# Environment detection and configuration
get_environment_config() {
    local environment="$1"
    local property="$2"
    local config_file="environments.yml"
    
    awk "
        /^[[:space:]]*${environment}:/ { in_section = 1; next }
        in_section && /^[[:space:]]*[a-zA-Z]/ && !/^[[:space:]]*${property}/ { in_section = 0 }
        in_section && /^[[:space:]]*${property}:/ { 
            gsub(/^[[:space:]]*${property}:[[:space:]]*/, \"\")
            gsub(/^[\"']/, \"\")
            gsub(/[\"']$/, \"\")
            print 
        }
    " "$CONFIG_DIR/$config_file"
}

# Variable substitution
substitute_variables() {
    local text="$1"
    
    # Replace common variables
    text="${text//\{version\}/$SOFTWARE_VERSION}"
    text="${text//\{platform_template\}/$PLATFORM_TEMPLATE}"
    text="${text//\{install_path\}/$INSTALL_PATH}"
    text="${text//\{gpg_keyid\}/$GPG_KEYID}"
    text="${text//\{md5\}/$NVIM_PLUGINS_MD5}"
    
    # Replace environment variables
    text="${text//\$HOME/$HOME}"
    text="${text//\$USER/$USER}"
    
    echo "$text"
}

# Load configuration for current environment
load_config() {
    export CONFIG_LOADED=1
    
    # Detect environment
    if [ "$WSL" = 1 ]; then
        export CURRENT_ENVIRONMENT="wsl"
    elif [ "$WORK_INSTALL" = 1 ]; then
        export CURRENT_ENVIRONMENT="work"
    elif [ "$WSL_ONLY" = 1 ]; then
        export CURRENT_ENVIRONMENT="docker"
    else
        export CURRENT_ENVIRONMENT="default"
    fi
    
    echo "Loaded config for environment: $CURRENT_ENVIRONMENT" >&2
}

# Test function to verify YAML parsing works
test_yaml_parsing() {
    echo "Testing YAML parsing..."
    echo "Common packages:"
    get_yaml_array "packages.yml" "common"
    echo
    echo "Ubuntu additional packages:"
    get_yaml_array "packages.yml" "ubuntu.additional"
    echo
    echo "Node.js version:"
    get_software_config "nodejs" "version"
    echo
}

# Initialize config if not already loaded
if [ "${CONFIG_LOADED:-0}" != 1 ]; then
    load_config
fi