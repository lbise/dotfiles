#!/bin/zsh

function runCommand() {
    for d in ./*/ ; do /bin/zsh -c "(cd "$d" && "$@")"; done
}

runCommand "git pull"
