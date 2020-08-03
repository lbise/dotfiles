#!/usr/bin/env bash

echo "run: $0 $@" > /home/lbise/.scripts/hotplug.log
MONITOR='DP-3-1'

xrandr >> /home/lbise/.scripts/hotplug.log

MONITORS=("DP-4" "DP-5")
cat /sys/class/drm/card0/card0-DP-4/status >> /home/lbise/.scripts/hotplug.log
cat /sys/class/drm/card0/card0-DP-5/status >> /home/lbise/.scripts/hotplug.log

exit

export DISPLAY=:1
export XAUTHORITY=/run/user/1000/gdm/Xauthority

set -e
MONITOR='DP-3'

function wait_for_monitor {
    xrandr | grep $MONITOR | grep '\bconnected'
    while [ $? -ne 0 ]; do
            logger -t "waiting for 100ms"
            sleep 0.1
            xrandr | grep $MONITOR | grep '\bconnected'
    done
 }

EXTERNAL_MONITOR_STATUS=$(cat /sys/class/drm/card0-$MONITOR/status )
if [ $EXTERNAL_MONITOR_STATUS  == "connected" ]; then
    wait_for_monitor
    xrandr --output $MONITOR --auto --primary --output LVDS-1 --auto --left-of $MONITOR
    /home/USERNAME/bin/i3plug.py restore
else
    /home/USERNAME/bin/i3plug.py save
    xrandr --output $MONITOR --off
fi

feh --bg-scale /home/USERNAME/wallpaper.jpg
