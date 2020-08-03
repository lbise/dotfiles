#!/usr/bin/env python3
import argparse
import subprocess
import sys

if __name__ == '__main__':
    parser = argparse.ArgumentParser(formatter_class=argparse.RawDescriptionHelpFormatter,
            description='Connect to wifi')
    parser.add_argument('command',
                    help = 'Command to run (list, connect)')

    parser.add_argument('-s', '--ssid',
                    help = 'SSID to connect to')
    args = parser.parse_args()

    if args.command == 'list':
        ret = subprocess.call(['nmcli', 'device', 'wifi', 'list', '--rescan' , 'yes'])
        if ret != 0:
            raise RuntimeError('Cannot list wifi')
    elif args.command == 'connect':
        if args.ssid is None:
            print('SSID missing')
            sys.exit()
        ret = subprocess.call(['nmcli', 'device', 'wifi', 'connect', args.ssid, '--ask'])
        if ret != 0:
            raise RuntimeError('Cannot connect wifi')

