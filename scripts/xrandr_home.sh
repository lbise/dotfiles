#!/usr/bin/env bash
PRIM_RES="2560x1440"
SEC_RES="1920x1080"

DO_AUTO=false
# Primary display is connected on display port and secondary on DVI
PRIM_DISPLAY=`xrandr | grep " connected " | grep "DP" | awk '{ print $1 }'`
if [ !"$PRIM_DISPLAY" == "DP*" ]; then
	echo "Cannot determine primary display ($PRIM_DISPLAY)"
	DO_AUTO=true
fi

SEC_DISPLAY=`xrandr | grep " connected " | grep "DVI" | awk '{ print $1 }'`
if [ !"$SEC_DISPLAY" == "DVI*" ]; then
	echo "Cannot determine secondary display ($SEC_DISPLAY)"
	DO_AUTO=true
fi

if [ $DO_AUTO = true  ]; then
	xrandr --auto
else
	xrandr --output $PRIM_DISPLAY --primary --mode $PRIM_RES --rotate normal --output $SEC_DISPLAY --mode $SEC_RES --rotate normal --right-of $PRIM_DISPLAY
fi
