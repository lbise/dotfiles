#!/usr/bin/env python3
# Helper for flashing Geosatis devices
import subprocess
import os

class GeoFlasher:
    def __init__(self, zephyr_path, sn_file):
        self.loadserials(sn_file)
        self.zpath = zephyr_path

    def loadserials(self, sn_file):
        print('Loading serials from {}'.format(sn_file))
        self.serials = []
        with open(sn_file, 'r') as f:
            lines = f.read().splitlines()
            for serial in lines:
                self.serials.append(serial)

    def checkargs(self, sn_idx, fw):
        if sn_idx >= len(self.serials):
            raise IndexError('Invalid serial index {}'.format(sn_idx))

        if not os.path.isdir(fw):
            raise NameError('Invalid firmware directory {}'.format(fw))

    def flash(self, sn_idx, fw, args = None):
        self.checkargs(sn_idx, fw)

        print('Flashing on probe [{}]{}...'.format(sn_idx, self.serials[sn_idx]))
        sub = []
        sub.append(self.zpath + '/geosatis/fw6_jtag.py')
        sub.append('-u {}'.format(self.serials[sn_idx]))
        if args != None:
            sub = sub + args
        sub.append(fw)
        print(sub)
        ret = subprocess.call(sub)
        if ret != 0:
            raise RuntimeError('Cannot flash {}'.format(fw))

    def geosap(self, sn_idx, fw, args = None):
        self.checkargs(sn_idx, fw)



    def flash_bootloader(self, sn_idx, args = None):
        if sn_idx >= len(self.serials):
            raise IndexError('Invalid serial index {}'.format(sn_idx))

        print('Flashing bootloader on probe [{}]{}...'.format(sn_idx, self.serials[sn_idx]))
        subprocess.call([self.zpath + '/geosatis/fw6_jtag.py', '-h'])
