#!/usr/bin/env bash

# Terminate already running bar instances
killall -q polybar
# If all your bars have ipc enabled, you can also use
# polybar-msg cmd quit

# https://github.com/polybar/polybar/issues/763
PRIMARY=`xrandr --query | grep " connected primary" | cut -d" " -f1`
echo "---" >> /tmp/polybar_main_$PRIMARY.log
echo "Start primary on $PRIMARY"
PRIMARY=$PRIMARY polybar --reload main >> /tmp/polybar_main_$PRIMARY.log 2>&1 &

for MON in $(xrandr --query | grep " connected" | cut -d" " -f1); do
	if [ $MON != "$PRIMARY" ]; then
		echo "---" >> /tmp/polybar_second_$MON.log
		echo "Start secondary on $MON"
		SECONDARY=$MON polybar --reload second >> /tmp/polybar_second_$MON.log 2>&1 &
	fi
done

echo "Bars launched..."
