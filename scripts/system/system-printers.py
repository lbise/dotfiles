#!/usr/bin/env python3
"""Report CUPS printers as JSON for the Quickshell bar and run queue actions.

Usage:
  system-printers.py status
  system-printers.py resume|pause|cancel-jobs PRINTER
"""

from __future__ import annotations

import json
import os
import re
import shlex
import socket
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote, urlsplit

COMMAND_TIMEOUT = 5
PROBE_TIMEOUT = 1.5
DNSSD_TIMEOUT = 3

STATE_LABELS = {'3': 'idle', '4': 'printing', '5': 'paused'}
DEFAULT_PORTS = {'ipp': 631, 'ipps': 631, 'http': 631, 'https': 443, 'socket': 9100, 'lpd': 515}
LOCAL_SCHEMES = {'usb', 'cnijusb', 'parallel', 'serial', 'file', 'cups-pdf', 'beh'}


def run(args: list[str], timeout: float = COMMAND_TIMEOUT) -> tuple[int, str, str]:
    env = dict(os.environ, LC_ALL='C')
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=env)
    except FileNotFoundError:
        return 127, '', f'{args[0]} is not installed'
    except subprocess.TimeoutExpired:
        return 124, '', f'{args[0]} timed out'
    return result.returncode, result.stdout, result.stderr


def is_noise_message(message: str) -> bool:
    """CUPS leaves filter exit notices and 'reason unknown' in the state message."""
    return message == 'reason unknown' or bool(re.search(r'\(PID \d+\) exited with no errors', message))


def parse_lpstat_printers(text: str) -> list[dict]:
    """Parse `lpstat -p`: one `printer NAME ...` line plus indented message lines."""
    printers = []
    for line in text.splitlines():
        match = re.match(r'^printer (\S+) ', line)
        if match:
            printers.append({'name': match.group(1), 'enabled': ' disabled since ' not in line, 'message': ''})
        elif printers and line.startswith(('\t', ' ')):
            message = line.strip()
            if message and not is_noise_message(message):
                current = printers[-1]
                current['message'] = f"{current['message']} {message}".strip()
    return printers


def parse_lpoptions(text: str) -> dict[str, str]:
    options = {}
    try:
        tokens = shlex.split(text)
    except ValueError:
        tokens = text.split()
    for token in tokens:
        key, _, value = token.partition('=')
        options[key] = value
    return options


def parse_default(text: str) -> str:
    match = re.search(r'system default destination: (\S+)', text)
    return match.group(1) if match else ''


def parse_lpq(text: str) -> list[dict]:
    jobs = []
    for line in text.splitlines():
        match = re.match(r'^(\S+)\s+(\S+)\s+(\d+)\s+(.*?)\s+(\d+) bytes$', line.strip())
        if match:
            rank, owner, job_id, title, size = match.groups()
            jobs.append({'id': int(job_id), 'owner': owner, 'title': title.strip(), 'size': int(size), 'active': rank == 'active'})
    return jobs


def humanize_reason(reason: str) -> str:
    reason = re.sub(r'-(error|warning|report)$', '', reason)
    reason = reason.removeprefix('com.').replace('cups-', '').replace('-', ' ')
    return reason[:1].upper() + reason[1:]


def parse_reasons(value: str) -> list[str]:
    reasons = [part for part in value.split(',') if part and part != 'none']
    return [humanize_reason(reason) for reason in reasons]


def normalize_mac(value: str) -> str:
    return value.replace('-', ':').lower()


def parse_neighbors(text: str) -> dict[str, str]:
    """Map MAC addresses to IPv4 addresses from `ip neigh`."""
    neighbors = {}
    for line in text.splitlines():
        match = re.match(r'^(\d+\.\d+\.\d+\.\d+) .*lladdr (\S+)', line)
        if match and 'FAILED' not in line:
            neighbors[match.group(2).lower()] = match.group(1)
    return neighbors


def decode_avahi(value: str) -> str:
    return re.sub(r'\\(\d{3})', lambda match: chr(int(match.group(1))), value)


def parse_avahi_services(text: str) -> dict[str, tuple[str, int]]:
    """Map DNS-SD service names to (address, port) from `avahi-browse -rpt`."""
    services = {}
    for line in text.splitlines():
        fields = line.split(';')
        if len(fields) >= 9 and fields[0] == '=' and fields[2] == 'IPv4':
            services.setdefault(decode_avahi(fields[3]), (fields[7], int(fields[8] or 0)))
    return services


def describe_connection(uri: str) -> dict:
    """Classify a CUPS device URI and extract what is needed to probe it."""
    parts = urlsplit(uri)
    scheme = parts.scheme.lower()
    if scheme == 'cnijnet':
        return {'kind': 'network', 'mac': normalize_mac(uri.split(':/', 1)[1].strip('/'))}
    if scheme == 'dnssd':
        service = unquote(parts.netloc).split('._', 1)[0]
        return {'kind': 'network', 'service': service}
    if scheme in DEFAULT_PORTS and parts.hostname:
        try:
            port = parts.port or DEFAULT_PORTS[scheme]
        except ValueError:
            port = DEFAULT_PORTS[scheme]
        if parts.hostname in {'localhost', '127.0.0.1', '::1'}:
            return {'kind': 'local', 'host': parts.hostname}
        return {'kind': 'network', 'host': parts.hostname, 'port': port}
    if scheme in LOCAL_SCHEMES:
        return {'kind': 'local'}
    return {'kind': 'unknown'}


def tcp_probe(host: str, port: int) -> tuple[bool, float]:
    started = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=PROBE_TIMEOUT):
            return True, (time.monotonic() - started) * 1000
    except OSError:
        return False, 0


def ping_probe(address: str) -> tuple[bool, float]:
    code, output, _ = run(['ping', '-n', '-c', '1', '-W', '1', address], timeout=3)
    match = re.search(r'time=([\d.]+) ms', output)
    return code == 0, float(match.group(1)) if match else 0


def resolve(host: str) -> str:
    try:
        return socket.getaddrinfo(host, None, socket.AF_INET)[0][4][0]
    except (OSError, IndexError):
        return ''


def check_reachability(connection: dict, neighbors: dict[str, str], services: dict[str, tuple[str, int]]) -> dict:
    kind = connection['kind']
    if kind == 'local':
        return {'reachable': None, 'address': '', 'detail': 'Local connection'}
    if kind != 'network':
        return {'reachable': None, 'address': '', 'detail': 'Connection type unknown'}

    port = connection.get('port', 0)
    if 'mac' in connection:
        address = neighbors.get(connection['mac'], '')
        if not address:
            return {'reachable': False, 'address': '', 'detail': f"Not seen on the network ({connection['mac'].upper()})"}
    elif 'service' in connection:
        address, port = services.get(connection['service'], ('', 0))
        if not address:
            return {'reachable': False, 'address': '', 'detail': 'Not advertised on the network'}
    else:
        address = resolve(connection['host'])
        if not address:
            return {'reachable': False, 'address': connection['host'], 'detail': f"Cannot resolve {connection['host']}"}

    if port:
        ok, latency = tcp_probe(address, port)
        if ok:
            return {'reachable': True, 'address': address, 'detail': f'Port {port} open · {latency:.0f} ms'}
    ok, latency = ping_probe(address)
    if ok:
        detail = f'Ping {latency:.0f} ms' + (f' · port {port} closed' if port else '')
        return {'reachable': True, 'address': address, 'detail': detail}
    return {'reachable': False, 'address': address, 'detail': 'No reply'}


def collect_status() -> dict:
    code, output, error = run(['lpstat', '-p'])
    if code == 127:
        return {'ok': False, 'error': 'CUPS is not installed', 'printers': []}
    if code != 0 and 'No destinations added' not in (output + error):
        return {'ok': False, 'error': (error or output).strip() or 'CUPS is not responding', 'printers': []}
    printers = parse_lpstat_printers(output)

    default = parse_default(run(['lpstat', '-d'])[1])
    for printer in printers:
        options = parse_lpoptions(run(['lpoptions', '-p', printer['name']])[1])
        state = STATE_LABELS.get(options.get('printer-state', ''), 'idle' if printer['enabled'] else 'paused')
        if not printer['enabled']:
            state = 'paused'
        printer.update({
            'description': options.get('printer-info') or printer['name'],
            'model': options.get('printer-make-and-model', ''),
            'uri': options.get('device-uri', ''),
            'state': state,
            'accepting': options.get('printer-is-accepting-jobs', 'true') == 'true',
            'reasons': parse_reasons(options.get('printer-state-reasons', '')),
            'isDefault': printer['name'] == default,
            'jobs': parse_lpq(run(['lpq', '-P', printer['name']])[1]),
        })
        printer['connection'] = describe_connection(printer['uri'])

    connections = [printer['connection'] for printer in printers]
    neighbors = parse_neighbors(run(['ip', 'neigh'])[1]) if any('mac' in c for c in connections) else {}
    services = {}
    if any('service' in c for c in connections):
        services = parse_avahi_services(run(['avahi-browse', '-rpt', '_ipp._tcp'], timeout=DNSSD_TIMEOUT)[1])

    with ThreadPoolExecutor(max_workers=max(1, len(printers))) as pool:
        results = list(pool.map(lambda c: check_reachability(c, neighbors, services), connections))
    for printer, network in zip(printers, results):
        printer['network'] = network
        printer['connection'] = printer['connection']['kind']

    return {'ok': True, 'error': '', 'printers': printers}


ACTIONS = {
    'resume': [['cupsenable'], ['cupsaccept']],
    'pause': [['cupsdisable']],
    'cancel-jobs': [['cancel', '-a']],
}


def run_action(action: str, printer: str) -> int:
    for command in ACTIONS[action]:
        code, _, error = run(command + [printer])
        if code != 0:
            print(error.strip() or f'{command[0]} failed', file=sys.stderr)
            return code
    return 0


def main(argv: list[str]) -> int:
    if argv[:1] == ['status'] or not argv:
        print(json.dumps(collect_status()))
        return 0
    if len(argv) == 2 and argv[0] in ACTIONS:
        return run_action(argv[0], argv[1])
    print(__doc__.strip(), file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
