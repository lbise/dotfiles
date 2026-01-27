#!/usr/bin/env bash

# Install required packages and GUI (system-config-printer)
sudo pacman --needed -S cups system-config-printer cups-pdf ghostscript gsfonts
sudo usermod -aG lp $USER

sudo systemctl enable --now cups.service
sudo systemctl restart cups.service

# Install drivers
# 27.01.2026: Package does not work, cannot seem to download drivers from canon.
# Had to go manually in ~/.cache/yay/canon-pixma-mg5200-complete and do:
# * wget https://files.canon-europe.com/files/soft40260/Software/MG5200series-scanner_driver.tar
# * wget https://files.canon-europe.com/files/soft40259/Software/MG5200series-printer_driver.tar
yay -S --needed canon-pixma-mg5200-complete

echo "Looking for network printer..."
PRINTER=$(cnijnetprn --installer --search auto)

echo "Printer: $PRINTER"

# Expected output
# network cnijnet:/00-1E-8F-AD-3D-EC "Canon MG5200 series" "IP:192.168.1.28"

# Extract the cnijnet address
PRINTER_ADDRESS=$(echo "$PRINTER" | grep -oP 'cnijnet:[^ ]+' | head -n1)

if [ -z "$PRINTER_ADDRESS" ]; then
    echo "Error: Could not find printer address"
    exit 1
fi

echo "Address: $PRINTER_ADDRESS"

# Register printer
echo "Registering printer..."
sudo lpadmin -p MG5200 -m canonmg5200.ppd -v "$PRINTER_ADDRESS" -E
