# When authenticated with LDAP login shell is bash, execute zsh only then.
# Not for `bash -ic CMD`: Herdr starts programs that way, and zsh would drop CMD.
if [[ $- == *i* ]] && [ -x /usr/bin/zsh ] && [ -z "$ZSH_VERSION" ] && [ -z "$BASH_EXECUTION_STRING" ]; then
    exec zsh
fi

# Fallback for hosts where zsh is unavailable.
if [[ $- == *i* ]] && [ -f "$HOME/.config/shell/ssh-auth-sock.sh" ]; then
    source "$HOME/.config/shell/ssh-auth-sock.sh"
    if [ -f "$HOME/.config/shell/herdr-display.sh" ]; then
        source "$HOME/.config/shell/herdr-display.sh"
    fi
fi
