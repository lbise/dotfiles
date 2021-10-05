#!/bin/env bash

sudo mkdir -p /mnt/p /mnt/t /mnt/u
sudo mount -t drvfs P: /mnt/p
sudo mount -t drvfs T: /mnt/t
sudo mount -t drvfs u: /mnt/u
sudo mount -t drvfs z: /mnt/z
