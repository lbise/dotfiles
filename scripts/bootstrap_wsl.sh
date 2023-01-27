#!/bin/env bash
# Setup username and give it sudo access
echo "Please give your username"
read username
adduser -q $username --force-badname
usermod -a -G sudo $username

cat <<EOF >/etc/wsl.conf
[user]
default=$username
EOF
