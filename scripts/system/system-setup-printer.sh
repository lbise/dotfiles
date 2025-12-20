#!/usr/bin/env bash

sudo pacman -S cups
sudo systemctl enable --now cups.service
sudo usermod -aG lp $USER
