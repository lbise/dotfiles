# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load --- if set to "random", it will
# load a random theme each time oh-my-zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/robbyrussell/oh-my-zsh/wiki/Themes
ZSH_THEME="candy"

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion.
# Case-sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment the following line to disable bi-weekly auto-update checks.
# DISABLE_AUTO_UPDATE="true"

# Uncomment the following line to change how often to auto-update (in days).
# export UPDATE_ZSH_DAYS=13

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
DISABLE_AUTO_TITLE="true"
# DISABLE_AUTO_TITLE must be set to true for this function to work
function set_terminal_title() {
    echo -en "\e]2;$@\a"
}

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load?
# Standard plugins can be found in ~/.oh-my-zsh/plugins/*
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(
  #git # Slows down a lot when using WSL
  colorize
  colored-man-pages
  fzf
  ssh-agent
  vi-mode
)

# !! MUST BE BEFORE SOURCE !!
if [ "$USER" = "13lbise" ]; then
    key="id_ed25519_git_sonova"
elif [ "$USER" = "leo" ]; then
    key="id_rsa"
	export SSH_KEY_PATH="~/.ssh/rsa_id"
fi

if [ -e "$HOME/.ssh/$key" ]; then
    zstyle :omz:plugins:ssh-agent identities $key
else
    echo "!!! SSH key does not exist: $key !!!"
    DEL="ssh-agent"
    plugins=( "${plugins[@]/$DEL}" )
fi

source $ZSH/oh-my-zsh.sh

# Add vi-mode indication to prompt
#PROMPT="$PROMPT\$(vi_mode_prompt_info)"
#RPROMPT="\$(vi_mode_prompt_info)$RPROMPT"

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

export EDITOR='nvim'
# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='mvim'
# fi

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# Set personal aliases, overriding those provided by oh-my-zsh libs,
# plugins, and themes. Aliases can be placed here, though oh-my-zsh
# users are encouraged to define aliases within the ZSH_CUSTOM folder.
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"
#

setopt notify    # immediate job notifications

# 10ms for key sequences
KEYTIMEOUT=15

# History
HISTSIZE=10000
SAVEHIST=10000
HISTFILE=${HISTFILE:-$HOME/.zsh_history}
setopt share_history
setopt hist_ignore_dups
setopt hist_ignore_space
setopt inc_append_history

# Enable auto completion
autoload -Uz compinit
compinit

# Update PATH, ensure local user nvim/node is favoured
export PATH=~/.bin/nvim-linux-x86_64/bin:~/.bin/node-v20.13.1-linux-x64/bin:$PATH:~/.scripts:~/.bin:~/.local/bin:~/.opencode/bin:~/.bun/bin
# Prompt for passphrase
export GPG_TTY=$(tty)
# Prevent zsh opening a new window on git diff for example
unset LESS

#### FZF ####
# Use ripgrep for fzf, ignore .git folder, ignore some file extensions
export FZF_DEFAULT_COMMAND='rg --files --no-ignore-vcs --hidden -g "!.git" -g "!*.{so,dll}"'
# Ignore case, multi choice
export FZF_DEFAULT_OPTS="-i -m --border --height 40%"
# FZF nord theme
# See https://github.com/junegunn/fzf/blob/master/ADVANCED.md?ref=morioh.com&utm_source=morioh.com#color-themes
export FZF_DEFAULT_OPTS=$FZF_DEFAULT_OPTS'
--color=dark
--color=fg:-1,bg:-1,hl:#c678dd,fg+:#ffffff,bg+:#4b5263,hl+:#d858fe
--color=info:#98c379,prompt:#61afef,pointer:#be5046,marker:#e5c07b,spinner:#61afef,header:#61afef'

#export FZF_DEFAULT_OPTS=$FZF_DEFAULT_OPTS'
#    --color=bg+:#3B4252,bg:#2E3440,spinner:#81A1C1,hl:#616E88,fg:#D8DEE9
#    --color=header:#616E88,info:#81A1C1,pointer:#81A1C1,marker:#81A1C1
#    --color=fg+:#D8DEE9,prompt:#81A1C1,hl+:#81A1C1'

# Support 24bit color
export COLORTERM=truecolor

#### BINDINGS ####
# ctrl + space starts sessionizer. If we are running in tmux this will not be
# executed, but rather the tmux binding since ctrl + space is tmux prefix
bindkey -s '^@' "^utmux-sessionizer\n"

#### VARIABLES ####
DOT="$HOME/gitrepo/dotfiles"

#### ALIASES ####
alias lfskill="git rm --cached -r .;git reset --hard;git rm .gitattributes;git reset .;git checkout ."
alias vim=nvim
alias dotupdate="dotupdate.sh"
# Update tmux env with current env variables
alias tmux_env="tmux refresh-client -S && eval $(tmux showenv -s | grep -E '^(SSH|DISPLAY)')"

# If running tmux, add hook to update tmux env in shell
if [[ -n "$TMUX" ]]; then
precmd() {
    tmux refresh-client -S
    eval $(tmux showenv -s | grep -E '^(SSH|DISPLAY)')
}
fi

# Docker devenv
devenv_img="ch03git.phonak.com/13lbise/devenv:latest"
devenv_name="devenv"
devenv_dotfiles="~/gitrepo/leo_dotfiles"

# Docker compose shortcuts
alias dbuild="docker compose -f $devenv_dotfiles/docker/docker-compose.build.yml build"
alias dup="docker compose -f $devenv_dotfiles/docker/docker-compose.run.yml up -d"
alias ddown="docker compose -f $devenv_dotfiles/docker/docker-compose.run.yml down"
alias dlogs="docker compose -f $devenv_dotfiles/docker/docker-compose.run.yml logs -f"
alias drestart="ddown && dup"

# Docker image management
alias dpush="docker push $devenv_img"
alias dpull="docker pull $devenv_img"
alias dbuild-push="$devenv_dotfiles/scripts/devenv_build.sh"

# Container interaction functions with smart working directory mapping
# Helper function to execute commands in container with proper working directory
_docker_exec_with_workdir() {
    local host_path="$(pwd)"
    local container_path="$(echo "$host_path" | sed 's|/home/13lbise|/home/leodev|')"

    # Check if the mapped path exists in container, fallback to /home/leodev if not
    if docker exec $devenv_name test -d "$container_path" 2>/dev/null; then
        docker exec -it -w "$container_path" $devenv_name "$@"
    else
        docker exec -it -w "/home/leodev" $devenv_name "$@"
    fi
}

# Docker container interaction functions
dshell() { _docker_exec_with_workdir zsh "$@"; }
dvim() { _docker_exec_with_workdir nvim "$@"; }
dopencode() { _docker_exec_with_workdir opencode "$@"; }
dexec() { _docker_exec_with_workdir "$@"; }

# Docker utilities
alias dps="docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
alias dpsa="docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
alias dimages="docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}'"
alias dclean="docker system prune -f"
alias dclean-all="docker system prune -af && docker volume prune -f"

# Quick status check
alias dstatus="echo '=== Running Containers ===' && dps && echo '\n=== Images ===' && dimages"

# Quick container health check
alias dhealth="docker exec -it $devenv_name ps aux | head -10"

# Copy files to/from container
alias dcp-to="docker cp" # Usage: dcp-to file.txt devenv:/home/leodev/
alias dcp-from="docker cp" # Usage: dcp-from devenv:/home/leodev/file.txt ./

# Container resource usage
alias dstats="docker stats --no-stream"

if [ -f "$HOME/.keys" ]; then
    source "$HOME/.keys"
fi

if [ "$USER" = "13lbise" ]; then
    alias aruffall="ruff check --config $ANDROMEDA_ROOT/pyproject.toml $ANDROMEDA_ROOT/rom $ANDROMEDA_ROOT/pctools $ANDROMEDA_ROOT/executer"
    MYT="/mnt/ch03transfer/${USER}"
    WT="/mnt/c/Users/13lbise/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState"
    CURRENT_DIR=$PWD
    if [ -d "$HOME/andromeda" ]; then
        # Sourceme then go back to pwd
        cd $HOME/andromeda
        source sourceme
        cd $CURRENT_DIR
    fi
fi

if [[ -n "$IS_WSL" || -n "$WSL_DISTRO_NAME" ]]; then
    # Running WSL
    # Use regular x11, requires vcxsrv to be running on Windows
    # export DISPLAY=$(ip route list default | awk '{print $3}'):0
    # Use WSLg built-in
    export DISPLAY=":0"
    echo "- WSL detected: Setting DISPLAY=$DISPLAY"
fi

#### MISC ####
# Set window title
if [ $HOST = "CH03MWJ5QLLN3" ]; then
    HOSTNAME="WSL"
else
    HOSTNAME=$HOST
fi

TITLE="$HOSTNAME : ${PWD##*/}"
set_terminal_title $TITLE

function chpwd () {
    TITLE="$HOSTNAME : ${PWD##*/}"
    set_terminal_title $TITLE
}
