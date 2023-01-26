#!/bin/env bash

sudo mkdir -p /mnt/p /mnt/t /mnt/u /mnt/ch03pool/murten_mirror
sudo mount -t drvfs P: /mnt/p
sudo mount -t drvfs T: /mnt/t
sudo mount -t drvfs u: /mnt/u
sudo mount -t drvfs z: /mnt/z
sudo mount -t drvfs z: /mnt/ch03pool/murten_mirror
