#!/usr/bin/env bash
PRIM_DISPLAY="DP-1"
PRIM_RES="2560x1440"
SEC_DISPLAY="DVI-I-1"
SEC_RES="1920x1080"

xrandr --output $PRIM_DISPLAY --primary --mode $PRIM_RES --rotate normal --output $SEC_DISPLAY --mode $SEC_RES --rotate normal --right-of $PRIM_DISPLAY
#xrandr --output DVI-I-1 --mode 1920x1080 --pos 2560x0 --rotate normal --output HDMI-0 --off --output DP-0 --primary --mode 2560x1440 --pos 0x0 --rotate normal --output DP-1 --off --output DVI-D-0 --off
