#!/usr/bin/env bash
# Symbolic link management for dotfiles installation

# Source common variables and functions
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

rm_symlinks() {
    print_section "Deleting existing dotfiles"
    $X_ON
    $RM_RF ~/.vimrc
    $RM_RF ~/.vim
    $RM_RF ~/.gitconfig
    $RM_RF ~/.githooks
    $RM_RF ~/.zshrc
    $RM_RF ~/.bashrc
    $RM_RF ~/.ctags
    $RM_RF ~/.scripts
    $RM_RF ~/.gdbinit
    $RM_RF ~/.gdbinit.d
    $RM_RF ~/.tmux.conf
    $RM_RF ~/.tmux
    $RM_RF ~/.config/nvim
    $RM_RF ~/.config/ruff
    $RM_RF ~/.config/ghostty
    $RM_RF ~/.local/share/applications/ghostty.desktop
    if [ ! -d ~/.gnupg ]; then
        $MKDIR ~/.gnupg
        $CHMOD 700 ~/.gnupg
    fi
    $RM_RF ~/.gnupg/gpg.conf
    $RM_RF ~/.gnupg/gpg-agent.conf
    $RM_RF ~/.clang-format
    $RM_RF ~/.aider.conf.yml
    if [ ! -d ~/.config/opencode ]; then
        $MKDIR ~/.config/opencode
    fi
    $RM_RF ~/.config/opencode/opencode.json
    $X_OFF
}

ln_symlinks() {
    print_section "Create symbolic links"
    $X_ON
    $LN_SF "$DOTFILES_DIR/.vimrc" ~/.vimrc
    $LN_SF "$DOTFILES_DIR/vim" ~/.vim
    if [ "$WORK_INSTALL" = 1 ]; then
        $LN_SF "$DOTFILES_DIR/.gitconfigwork" ~/.gitconfig
    else
        $LN_SF "$DOTFILES_DIR/.gitconfig" ~/.gitconfig
    fi
    $LN_SF "$DOTFILES_DIR/githooks" ~/.githooks
    $LN_SF "$DOTFILES_DIR/.zshrc" ~/.zshrc
    $LN_SF "$DOTFILES_DIR/.bashrc" ~/.bashrc
    $LN_SF "$DOTFILES_DIR/.ctags" ~/.ctags
    $LN_SF "$DOTFILES_DIR/scripts" ~/.scripts
    $LN_SF "$DOTFILES_DIR/.gdbinit" ~/.gdbinit
    $LN_SF "$DOTFILES_DIR/.gdbinit.d" ~/.gdbinit.d
    $LN_SF "$DOTFILES_DIR/.tmux.conf" ~/.tmux.conf
    $LN_SF "$DOTFILES_DIR/tmux" ~/.tmux
    if [ ! -d ~/.config ]; then
        $MKDIR ~/.config
    fi
    $LN_SF "$DOTFILES_DIR/nvim" ~/.config/nvim
    $LN_SF "$DOTFILES_DIR/ruff" ~/.config/ruff
    $LN_SF "$DOTFILES_DIR/ghostty" ~/.config/ghostty
    $LN_SF "$DOTFILES_DIR/gpg/gpg.conf" ~/.gnupg/gpg.conf
    $LN_SF "$DOTFILES_DIR/gpg/gpg-agent.conf" ~/.gnupg/gpg-agent.conf
    $LN_SF "$DOTFILES_DIR/.clang-format" ~/.clang-format
    $LN_SF "$DOTFILES_DIR/.aider.conf.yml" ~/.aider.conf.yml
    $LN_SF "$DOTFILES_DIR/opencode.json" ~/.config/opencode/opencode.json
    if [ -d ~/.local/share/applications/ ]; then
        $LN_SF "$DOTFILES_DIR/ghostty/ghostty.desktop" ~/.local/share/applications/ghostty.desktop
    fi
    $X_OFF
}

setup_symlinks() {
    rm_symlinks
    ln_symlinks
}

# Allow this script to be run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    apply_test_mode
    setup_symlinks
fi