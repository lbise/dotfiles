#!/usr/bin/env bash
set -Eeuo pipefail

is_arch() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=arch' /etc/os-release
}

is_ubuntu() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=ubuntu' /etc/os-release
}
