#!/usr/bin/env bash

# This was inspired by
# https://gist.github.com/mikeboiko/b6e50210b4fb351b036f1103ea3c18a9

# The problem:
# When you `ssh -X` into a machine and attach to an existing tmux session, the session
# contains the old $DISPLAY env variable. In order the x-server/client to work properly,
# you have to update $DISPLAY after connection. For example, the old $DISPLAY=:0 and
# you need to change to $DISPLAY=localhost:10.0 for my ssh session to
# perform x-forwarding properly.

# The solution:
# When attaching to tmux session, update $DISPLAY for each tmux pane in that session.
# This is performed by using tmux send-keys to the shell. It will update the DISPLAY
# for panes running:
#   * zsh
#   * bash
#   * vim/nvim
#   * python
# If a pane is running something else (e.g. an ssh session into another machine) it
# is ignored.  Even if the pane is running one of the above processes, if you exit that
# process (say its running nvim and you exit to the zsh shell), the parent process
# will have the old DISPLAY variable.  In these cases manually run this script later.
VARS=("DISPLAY")
#VARS=("DISPLAY"
#      "KRB5CCNAME"
#      "SSH_AGENT_PID"
#      "SSH_ASKPASS"
#      "SSH_AUTH_SOCK"
#      "SSH_CONNECTION"
#      "SSH_CLIENT"
#      "WINDOWID"
#      "XAUTHORITY"
#      "GPG_TTY"
#      "SSH_TTY"
#)

# When running in tmux run-shell, the environment we get is already updated
# so we cannot check which one is different. Just re-export all of them
ALL_PANES=$(tmux list-panes -s -F "#{session_name}:#{window_index}.#{pane_index};#{pane_current_command}")
for PANE in ${ALL_PANES[@]}; do
    IFS=';' read -ra INFO <<< "$PANE"
    if [[ "${INFO[1]}" == "zsh" || "${INFO[1]}" == "bash" ]]; then
        for VAR in ${VARS[@]}; do
            NEW_VAL=$(tmux show-env | sed -n "s/^${VAR}=//p")
            if [ "$NEW_VAL" != "" ]; then
                tmux send-keys -t ${INFO[0]} Enter "export \"$VAR=$NEW_VAL\"" Enter
            fi
        done
    fi
done

exit
tmux list-panes -s -F "#{session_name}:#{window_index}.#{pane_index} #{pane_current_command}" | \
while read pane_process
do
    IFS=' ' read -ra pane_process <<< "$pane_process"
    if [[ "${pane_process[1]}" == "zsh" || "${pane_process[1]}" == "bash" ]]; then
        for VAR in ${VARS[@]}; do
            #CURR_VAL=${!VAR}
            NEW_VAL=$(tmux show-env | sed -n "s/^${VAR}=//p")
            if [ "$NEW_VAL" != "" ]; then
                #echo "$VAR: $NEW_VAL -> $CURR_VAL"
                #echo "$VAR: $NEW_VAL -> $CURR_VAL" >> ~/.tmux.env
                echo $"pane_process: ${pane_process[0]}"
                #tmux send-keys -t ${pane_process[0]} C-c "export \"$VAR=$NEW_VAL\"" Enter
            fi
        done
        #elif [[ "${pane_process[1]}" == *"python"* ]]; then
        #   tmux send-keys -t ${pane_process[0]} "import os; os.environ['\"$VAR\"']=\"$NEW_VAL\"" Enter
        #elif [[ "${pane_process[1]}" == *"vim"* ]]; then
        #   tmux send-keys -t ${pane_process[0]} Escape
        #   tmux send-keys -t ${pane_process[0]} ":let \$VAR = \"$NEW_VAL\"" Enter
    fi
done
