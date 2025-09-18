#!/usr/bin/env bash
# YAML-driven symbolic link management for dotfiles installation

# Source common variables and configuration utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

create_required_directories() {
    print_section "Creating required directories"

    # Get required directories from config
    local dirs=$(get_yaml_array "symlinks.yml" "required_directories")

    while IFS= read -r dir; do
        if [ -n "$dir" ]; then
            local full_path="$HOME/$dir"
            if [ ! -d "$full_path" ]; then
                echo "Creating directory: $full_path"
                $MKDIR -p "$full_path"
            fi
        fi
    done <<< "$dirs"

    # Set directory permissions
    $CHMOD 700 "$HOME/.gnupg" 2>/dev/null || true
    if [ -d "$HOME/.ssh" ]; then
        $CHMOD 700 "$HOME/.ssh"
    fi
}

remove_existing_symlinks() {
    print_section "Removing existing dotfiles"
    $X_ON

    # Remove core symlinks
    local core_links=$(get_symlinks "core")
    while IFS='|' read -r source target; do
        if [ -n "$source" ] && [ -n "$target" ]; then
            $RM_RF "$HOME/$target"
        fi
    done <<< "$core_links"

    # Remove config symlinks
    local config_links=$(get_symlinks "config")
    while IFS='|' read -r source target; do
        if [ -n "$source" ] && [ -n "$target" ]; then
            $RM_RF "$HOME/$target"
        fi
    done <<< "$config_links"

    # Remove other categories
    for category in gpg applications; do
        local links=$(get_symlinks "$category")
        while IFS='|' read -r source target; do
            if [ -n "$source" ] && [ -n "$target" ]; then
                $RM_RF "$HOME/$target"
            fi
        done <<< "$links"
    done

    $X_OFF
}

create_symlinks_from_config() {
    print_section "Creating symbolic links from YAML config"
    $X_ON

    # Create core symlinks
    local core_links=$(get_symlinks "core")
    while IFS='|' read -r source target; do
        if [ -n "$source" ] && [ -n "$target" ]; then
            echo "Linking: $source -> $target"
            $LN_SF "$DOTFILES_DIR/$source" "$HOME/$target"
        fi
    done <<< "$core_links"

    # Create config symlinks
    local config_links=$(get_symlinks "config")
    while IFS='|' read -r source target; do
        if [ -n "$source" ] && [ -n "$target" ]; then
            echo "Linking: $source -> $target"
            $LN_SF "$DOTFILES_DIR/$source" "$HOME/$target"
        fi
    done <<< "$config_links"

    # Handle git config (conditional)
    if [ "$WORK_INSTALL" = 1 ]; then
        $LN_SF "$DOTFILES_DIR/.gitconfigwork" "$HOME/.gitconfig"
    else
        $LN_SF "$DOTFILES_DIR/.gitconfig" "$HOME/.gitconfig"
    fi

    # Create GPG symlinks
    local gpg_links=$(get_symlinks "gpg")
    while IFS='|' read -r source target; do
        if [ -n "$source" ] && [ -n "$target" ]; then
            echo "Linking: $source -> $target"
            $LN_SF "$DOTFILES_DIR/$source" "$HOME/$target"
        fi
    done <<< "$gpg_links"

    # Create application symlinks (if directory exists)
    if [ -d "$HOME/.local/share/applications" ]; then
        local app_links=$(get_symlinks "applications")
        while IFS='|' read -r source target; do
            if [ -n "$source" ] && [ -n "$target" ]; then
                echo "Linking: $source -> $target"
                $LN_SF "$DOTFILES_DIR/$source" "$HOME/$target"
            fi
        done <<< "$app_links"
    fi

    $X_OFF
}

setup_symlinks_yaml() {
    create_required_directories
    remove_existing_symlinks
    create_symlinks_from_config
}

# Allow this script to be run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    apply_test_mode
    setup_symlinks_yaml
fi
