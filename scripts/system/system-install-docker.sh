#!/usr/bin/env bash

sudo pacman -S docker docker-compose

sudo systemctl start docker
sudo systemctl enable docker

sudo usermod -aG docker $USER

# Update user group directly
newgrp docker
