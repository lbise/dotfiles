#!/usr/bin/env bash
PRIM_RES="2560x1440"
PRIM_PORT="DP"
SEC_RES="1920x1080"
SEC_PORT="HDMI"

DO_AUTO=false
# Primary display is connected on display port and secondary on DVI
PRIM_DISPLAY=`xrandr | grep " connected " | grep "$PRIM_PORT" | awk '{ print $1 }'`
if [ "$PRIM_DISPLAY" = "" ] || [ !"$PRIM_DISPLAY" == "$PRIM_PORT*" ]; then
	echo "Cannot determine primary display ($PRIM_DISPLAY)"
	DO_AUTO=true
fi

SEC_DISPLAY=`xrandr | grep " connected " | grep "$SEC_PORT" | awk '{ print $1 }'`
if [ "$SEC_DISPLAY" = "" ] || [ !"$SEC_DISPLAY" == "$SEC_PORT*" ]; then
	echo "Cannot determine secondary display ($SEC_DISPLAY)"
	DO_AUTO=true
fi

if [ $DO_AUTO = true  ]; then
	xrandr --auto
else
	echo "Primary display: $PRIM_DISPLAY"
	echo "Secondary display: $SEC_DISPLAY"
	xrandr --output $PRIM_DISPLAY --primary --mode $PRIM_RES --rotate normal --output $SEC_DISPLAY --mode $SEC_RES --rotate normal --right-of $PRIM_DISPLAY
fi
