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
export PATH=~/.bin/nvim-linux64/bin:~/.bin/node-v20.13.1-linux-x64/bin:$PATH:~/.scripts:~/.bin:~/.local/bin
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

if [ -f "$HOME/.keys" ]; then
    source "$HOME/.keys"
fi

if [ "$USER" = "13lbise" ]; then
    MYT="/mnt/t/${USER}"
    WT="/mnt/c/Users/13lbise/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState"
    alias andro="cd $HOME/andromeda; source sourceme"
    alias androwin="cd /mnt/c/SVN/wp_13lbise/andromeda; source sourceme"
    CURRENT_DIR=$PWD
    if [ -d "$HOME/andromeda" ]; then
        # Sourceme then go back to pwd
        cd $HOME/andromeda
        source sourceme
        cd $CURRENT_DIR
    fi

    # Helios stuff
    export PYTHON310_64_EXE=/usr/bin/python3
fi

if [[ -n "$IS_WSL" || -n "$WSL_DISTRO_NAME" ]]; then
    # Running WSL
    echo "- WSL detected"
    export DISPLAY=$(awk '/nameserver / {print $2; exit}' /etc/resolv.conf 2>/dev/null):0
    echo "    DISPLAY=$DISPLAY"
    if [[ $PWD == *"/mnt/c"* ]]; then
        cd $HOME
    fi
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
