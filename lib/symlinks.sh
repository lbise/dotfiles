#!/usr/bin/env bash
# Simplified symbolic link management for dotfiles installation

# Source common variables and configuration utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

create_parent_directory() {
    local target_path="$1"
    local parent_dir=$(dirname "$target_path")
    
    if [ "$parent_dir" != "." ] && [ ! -d "$parent_dir" ]; then
        echo "Creating parent directory: $parent_dir"
        $MKDIR -p "$parent_dir"
    fi
}

apply_directory_permissions() {
    print_section "Applying directory permissions"
    
    # Get directory permissions from config
    local perms=$(get_yaml_array "symlinks.yml" "directory_permissions")
    
    # Apply hardcoded permissions for sensitive directories
    if [ -d "$HOME/.gnupg" ]; then
        $CHMOD 700 "$HOME/.gnupg"
        echo "Set permissions 700 for .gnupg"
    fi
    
    if [ -d "$HOME/.ssh" ]; then
        $CHMOD 700 "$HOME/.ssh" 
        echo "Set permissions 700 for .ssh"
    fi
}

remove_existing_symlinks() {
    print_section "Removing existing dotfiles"
    $X_ON

    # Get all symlinks and remove existing targets
    local all_links=$(get_symlinks)
    while IFS='|' read -r source target; do
        if [ -n "$source" ] && [ -n "$target" ]; then
            $RM_RF "$HOME/$target"
        fi
    done <<< "$all_links"

    $X_OFF
}

create_symlinks() {
    print_section "Creating symbolic links"
    $X_ON

    # Get all symlinks from config
    local all_links=$(get_symlinks)
    while IFS='|' read -r source target; do
        if [ -n "$source" ] && [ -n "$target" ]; then
            local target_path="$HOME/$target"
            
            # Create parent directory if needed
            create_parent_directory "$target_path"
            
            echo "Linking: $source -> $target"
            $LN_SF "$DOTFILES_DIR/$source" "$target_path"
        fi
    done <<< "$all_links"

    $X_OFF
}

handle_git_config() {
    print_section "Setting up git configuration"
    
    # Handle git config conditionally based on work install
    if [ "$WORK_INSTALL" = 1 ]; then
        echo "Linking work git config"
        $LN_SF "$DOTFILES_DIR/.gitconfigwork" "$HOME/.gitconfig"
    else
        echo "Linking personal git config"
        $LN_SF "$DOTFILES_DIR/.gitconfig" "$HOME/.gitconfig"
    fi
}

setup_symlinks() {
    remove_existing_symlinks
    create_symlinks
    handle_git_config
    apply_directory_permissions
}

# Allow this script to be run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    apply_test_mode
    setup_symlinks
fi
