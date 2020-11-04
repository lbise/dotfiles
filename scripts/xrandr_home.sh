#!/usr/bin/env bash
PRIM_RES="2560x1440"
PRIM_PORT="DP"
SEC_RES="1920x1080"
SEC_PORT="HDMI"

DO_AUTO=false

while read -r line ; do
	if [[ $line == *"$PRIM_RES"* ]]; then
		PRIM_DISPLAY=`echo $line | head -n1 | awk '{ print $1 }'`
	elif [[ $line == *"$SEC_RES"* ]]; then
		SEC_DISPLAY=`echo $line | head -n1 | awk '{ print $1 }'`
	fi
done < <(xrandr | grep " connected ")

if [ "$PRIM_DISPLAY" != "" ]; then
	echo "Primary display: \"$PRIM_DISPLAY\""
else
	echo "Cannot determine primary display"
fi

if [ "$SEC_DISPLAY" != "" ]; then
	echo "Secondary display: \"$SEC_DISPLAY\""
else
	echo "Cannot determine secondary display"
fi

if [ "$PRIM_DISPLAY" != "" ] && [ "$SEC_DISPLAY" != "" ]; then
	echo "Configuring primary and secondary display"
	xrandr --output $PRIM_DISPLAY --primary --mode $PRIM_RES --rotate normal --output $SEC_DISPLAY --mode $SEC_RES --rotate normal --right-of $PRIM_DISPLAY
elif [ "$PRIM_DISPLAY" != "" ] && [ "$SEC_DISPLAY" == "" ]; then
	echo "Configuring only primary"
	xrandr --output $PRIM_DISPLAY --primary --mode $PRIM_RES --rotate normal
elif [ "$PRIM_DISPLAY" == "" ] && [ "$SEC_DISPLAY" != "" ]; then
	echo "Configuring only secondary"
	xrandr --output $SEC_DISPLAY --mode $SEC_RES --rotate normal
else
	echo "Configuring auto"
	xrandr --auto
fi
