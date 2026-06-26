# Setup aliases and env
source $HOME/.aliases
source $HOME/.exports
if [ -f "$HOME/.keys" ]; then
    source "$HOME/.keys"
fi

export ZSH="$HOME/.oh-my-zsh"
autoload -Uz add-zsh-hook

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

typeset -g __TMUX_ENV_CACHE=""
update_tmux_env() {
    [[ -n "${TMUX:-}" ]] || return

    # Existing tmux panes do not automatically inherit environment updates when
    # a client re-attaches, so sync the interactive shell from tmux's session
    # environment. preexec makes the first command after re-attach see the new
    # values; precmd keeps prompts/new shells up to date.
    local env_vars='(DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|SSH_AUTH_SOCK|SSH_AGENT_PID|SSH_CONNECTION|SSH_CLIENT|SSH_TTY|KRB5CCNAME)'
    local tmux_env
    tmux_env=$(tmux show-environment -s 2>/dev/null | grep -E "^${env_vars}=|^unset ${env_vars};") || true

    [[ -n "$tmux_env" ]] || return
    [[ "$tmux_env" == "$__TMUX_ENV_CACHE" ]] && return

    __TMUX_ENV_CACHE="$tmux_env"
    eval "$tmux_env"
}

add-zsh-hook precmd update_tmux_env
add-zsh-hook preexec update_tmux_env

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

# Bindings outside tmux. Inside tmux, use tmux-native bindings instead:
#   prefix + f       tmux sessionizer
#   prefix + Shift-s SSH machine picker
if [[ -z "${TMUX:-}" ]]; then
    # tmux session picker: Ctrl-Space
    bindkey -M emacs -s '^@' "^utmux-sessionizer\n"
    bindkey -M viins -s '^@' "^utmux-sessionizer\n"

    # SSH machine picker: Ctrl-X then s
    # Avoid Ctrl-S because terminal flow control can intercept it.
    bindkey -M emacs -s '^Xs' "^ussh_phc.sh\n"
    bindkey -M viins -s '^Xs' "^ussh_phc.sh\n"
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# bun completions
[ -s "/home/leo/.bun/_bun" ] && source "/home/leo/.bun/_bun"

# Go
export GOROOT=$HOME/go-sdk
export PATH=$GOROOT/bin:$PATH
