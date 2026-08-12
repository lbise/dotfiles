# When authenticated with LDAP login shell is bash, execute zsh only then
if [[ $- == *i* ]] && [ -x /usr/bin/zsh ] && [ -z "$ZSH_VERSION" ]; then
    exec zsh
fi

# Fallback for hosts where zsh is unavailable.
if [[ $- == *i* ]] && [ -f "$HOME/.config/shell/ssh-auth-sock.sh" ]; then
    source "$HOME/.config/shell/ssh-auth-sock.sh"
fi
