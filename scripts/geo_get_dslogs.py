#!/usr/bin/env python3
import argparse
import os

SERV_US='172.16.160.115'
SERV_UAT='172.16.160.210'
SERV_BRSKUB='172.16.160.202'
DEFAULT_SERV=SERV_UAT

DSS_DIR='/logs/dss'
DSV_DIR='/logs/dsv6'

if __name__ == '__main__':
    parser = argparse.ArgumentParser(formatter_class=argparse.RawDescriptionHelpFormatter,
	        description='Gets a DSS log')
    parser.add_argument('-s', '--server', default=DEFAULT_SERV,
                        help = 'Server address. Can be an IP address or a keyword (US/UAT/BRSKUB) (Default {})'.format(DEFAULT_SERV))
    parser.add_argument('-d', '--date',
                        help = 'Specific date in YYYY-MM-DD format (Gets current log if not specified)')
    parser.add_argument('-o', '--out', default='.',
                        help = 'Output directory (Current dir if not specified)')
    parser.add_argument('--dsv', action='store_true',
                        help = 'Get dsv (GMS2) log instead of dss (GMS3)')
    parser.add_argument('-r', '--remote-dir',
                        help = 'Remote log directory')
    parser.add_argument('-p', '--packets', action='store_true',
                        help = 'Gets dss-packets log (Gets dss log if not specified)')
    args = parser.parse_args()

    if args.remote_dir:
        remote_dir = args.remote_dir
    else:
        remote_dir = DSS_DIR
        if args.dsv:
            remote_dir = DSV_DIR

    if args.dsv:
        base = 'dsv6'
    else:
        base = 'dss'

    ext = '.log'
    if args.packets:
        base += '-packets'

    if args.date:
        base += '-' + args.date
        ext += '.gz'

    addr = args.server
    if args.server == 'UAT':
        addr = SERV_UAT
    elif args.server == 'US':
        addr = SERV_US
    elif args.server == 'BRSKUB':
        addr = SERV_BRSKUB

    log = '{}{}'.format(base, ext)
    out = '{}/{}_{}.log'.format(args.out, args.server, base)

    scp_cmd='scp {}:{}/{} {}'.format(addr, remote_dir, log, args.out)
    print(scp_cmd)
    os.system(scp_cmd)
    if 'gz' in ext:
        gunzip_cmd = 'gunzip -c {}/{} > {}/{}'.format(args.out, log, args.out, out)
        print(gunzip_cmd)
        os.system(gunzip_cmd)
        rm_cmd = 'rm {}/{}'.format(args.out, log)
        print(rm_cmd)
        os.system(rm_cmd)
