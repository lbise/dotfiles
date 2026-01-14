# Setup aliases and env
source $HOME/.aliases
source $HOME/.exports
if [ -f "$HOME/.keys" ]; then
    source "$HOME/.keys"
fi

export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="candy"

plugins=(
    colorize
    colored-man-pages
    fzf
    vi-mode
)

# ssh-agent must only be running on the local machine
# When connected through SSH public key is forwarded
if [[ -z "$SSH_CONNECTION" ]]; then
    plugins+=(ssh-agent)
    # Setup ssh-agent for work
    if [ "$USER" = "13lbise" ]; then
        # Work key
        KEY="id_ed25519_git_sonova"
    else
        # Default key
        KEY="id_rsa"
    fi

    zstyle :omz:plugins:ssh-agent identities $KEY
fi

# Disable automatic window title change
DISABLE_AUTO_TITLE="true"
function set_terminal_title() {
    echo -en "\e]2;$@\a"
}

# Set window title to hostname : tmux session
function update_title() {
    # No title update when in tmux
    [[ -n "$TMUX" ]] && return

    print -Pn "\e]0;${HOST}\a"
}

update_title

source $ZSH/oh-my-zsh.sh
# --------------------------------------------------------------------------------

# Work specific
if [ "$USER" = "13lbise" ]; then
    source $HOME/.zsh_work
fi

# Load completions
autoload -Uz compinit && compinit

# History
HISTSIZE=10000
SAVEHIST=10000
HISTDUP=erase
HISTFILE=${HISTFILE:-$HOME/.zsh_history}
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

# Prompt for passphrase
export GPG_TTY=$(tty)

##### FZF #####
# Integrate fzf in shell
eval "$(fzf --zsh)"
# Default options: Ignore case, full style, 40% height
export FZF_DEFAULT_OPTS="-i --style full --height 40%"

# Bindings
bindkey -s '^@' "^utmux-sessionizer\n"

# !! Old stuff to be removed !!
#alias tmux_env="tmux refresh-client -S && eval $(tmux showenv -s | grep -E '^(SSH|DISPLAY)')"
#
#check_tty_integrity() {
#    if [[ "$(stty -a)" == *"-icrnl"* ]]; then
#        print -P "%F{red}[WARNING]%f TTY flag '%F{yellow}$flag%f' is OFF (corrupted state detected)"
#        stty icrnl
#    fi
#}
#
## If running tmux, add hook to update tmux env in shell
#if [[ -n "$TMUX" ]]; then
#precmd() {
#    tmux refresh-client -S
#    eval $(tmux showenv -s | grep -E '^(SSH|DISPLAY)')
#    check_tty_integrity
#}
#fi
#
#if [[ -n "$IS_WSL" || -n "$WSL_DISTRO_NAME" ]]; then
#    # Running WSL
#    # Use regular x11, requires vcxsrv to be running on Windows
#    # export DISPLAY=$(ip route list default | awk '{print $3}'):0
#    # Use WSLg built-in
#    export DISPLAY=":0"
#    echo "- WSL detected: Setting DISPLAY=$DISPLAY"
#fi
