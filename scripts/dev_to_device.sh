#!/bin/bash

for sysdevpath in $(find /sys/bus/usb/devices/usb*/ -name dev); do
    (
        syspath="${sysdevpath%/dev}"
        devname="$(udevadm info -q name -p $syspath)"
        [[ "$devname" == "bus/"* ]] && exit
        eval "$(udevadm info -q property --export -p $syspath)"
        [[ -z "$ID_SERIAL" ]] && exit
        #udevadm info -a -p $syspath
        echo "/dev/$devname - $ID_SERIAL - $syspath"
    )
done

echo ""
echo "Run for more info: udevadm info --attribute-walk --path=\$(udevadm info --query=path --name=/dev/ttyUSB0)"
