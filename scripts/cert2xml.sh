#!/bin/bash

if [ $# -ne 1 ]; then
	echo "Usage: cert2xml.sh <cert.der>"
	exit
fi

openssl x509 -inform der -in $1 -text > _tmp
serial=$(cat _tmp | grep "Serial" | sed "s/.*0x//" | sed "s/)//" | xxd -p -r)
uniqueId=$(cat /dev/urandom | tr -dc 'A-Z0-9' | fold -w 8 | head -n 1)
bluetoothAddr=00000000

x=$(cat _tmp | sed -e '1,/-----BEGIN/d' -e '/-----END/,$d')

echo -e "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>
<import>
<devices>
    <braceletV6>
        <serialNumber>$serial</serialNumber>
        <unitId>$uniqueId</unitId>
        <bluetoothAddress>$bluetoothAddr</bluetoothAddress>
        <size>L</size>
        <publicCertificate>$x</publicCertificate>
        <geosapVersion>3</geosapVersion>
    </braceletV6>
</devices>
</import>"

rm _tmp

