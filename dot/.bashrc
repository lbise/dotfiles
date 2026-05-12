# When authenticated with LDAP login shell is bash, execute zsh only then
if [[ $- == *i* ]] && [ -x /usr/bin/zsh ] && [ -z "$ZSH_VERSION" ]; then
    exec zsh
fi
