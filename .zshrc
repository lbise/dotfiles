# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:/usr/local/bin:$PATH

export COLORTERM=truecolor

# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load --- if set to "random", it will
# load a random theme each time oh-my-zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/robbyrussell/oh-my-zsh/wiki/Themes
ZSH_THEME="candy"

# powerlevel9k config
#POWERLEVEL9K_PROMPT_ON_NEWLINE=true
#POWERLEVEL9K_SHORTEN_DIR_LENGTH=2
#POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(dir nvm vcs)
##POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=(status history time)
#POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=()
##POWERLEVEL9K_MODE='awesome-fontconfig'
## Use fonts from https://github.com/ryanoasis/nerd-fonts
#POWERLEVEL9K_MODE='nerdfont-complete'

# Set list of themes to pick from when loading at random
# Setting this variable when ZSH_THEME=random will cause zsh to load
# a theme from this variable instead of looking in ~/.oh-my-zsh/themes/
# If set to an empty array, this variable will have no effect.
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

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
)

# !! MUST BE BEFORE SOURCE !!
if [ "$USER" = "13lbise" ]; then
	zstyle :omz:plugins:ssh-agent identities id_ed25519_git_sonova
elif [ "$USER" = "leo" ]; then
	zstyle :omz:plugins:ssh-agent identities id_rsa
	export SSH_KEY_PATH="~/.ssh/rsa_id"
fi

source $ZSH/oh-my-zsh.sh

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

export EDITOR='vim'
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
# Bindings
# FIXME: Not used any more
#function setkeybind {
#	if [ "${key[$1]}" != "" ]; then
#		bindkey "${key[$1]}" $2
#	else
#		echo "No key code for $1"
#	fi
#}
#
#if [ -f "$HOME/.zkbd/$TERM-:0" ]; then
#	source $HOME/.zkbd/$TERM-:0
#	setkeybind Home beginning-of-line
#	setkeybind End end-of-line
#	setkeybind Insert overwrite-mode
#	setkeybind Delete delete-char
#	setkeybind Up up-line-or-history
#	setkeybind Down down-line-or-history
#	setkeybind Left backward-char
#	setkeybind Right forward-char
#	setkeybind PageUp history-beginning-search-backward
#	setkeybind PageDown history-beginning-search-forward
#else
#	echo "zkbd file missing for $TERM"
#fi

setopt notify    # immediate job notifications

# 10ms for key sequences
KEYTIMEOUT=1

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

# Add .scripts to PATH
export PATH=$PATH:~/.scripts
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
    --color=bg+:#3B4252,bg:#2E3440,spinner:#81A1C1,hl:#616E88,fg:#D8DEE9
    --color=header:#616E88,info:#81A1C1,pointer:#81A1C1,marker:#81A1C1
    --color=fg+:#D8DEE9,prompt:#81A1C1,hl+:#81A1C1'

#### BINDINGS ####
# ctrl + space starts sessionizer. If we are running in tmux this will not be
# executed, but rather the tmux binding since ctrl + space is tmux prefix
bindkey -s '^@' "^utmux-sessionizer\n"

#### VARIABLES ####
DOT="$HOME/gitrepo/dotfiles"

#### ALIASES ####
alias lfskill="git rm --cached -r .;git reset --hard;git rm .gitattributes;git reset .;git checkout ."

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
