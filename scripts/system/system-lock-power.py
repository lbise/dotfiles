#!/usr/bin/env python3
"""Power controls for Hyprlock. Restart/poweroff require two clicks in 3 seconds.

Usage: system-lock-power.py suspend|reboot|poweroff
       system-lock-power.py status reboot|poweroff

This never authenticates or unlocks the session. It stores only a pending
power action and its timestamp in the user's private runtime directory.
"""

import fcntl
import json
import os
import stat
import subprocess
import sys
import time
from pathlib import Path

LABELS = {'reboot': 'Restart', 'poweroff': 'Shut down'}
CONFIRM_SECONDS = 3


def pending(state: dict, action: str, now: float) -> bool:
    age = now - state.get('at', 0)
    return state.get('action') == action and 0 <= age < CONFIRM_SECONDS


def transition(state: dict, action: str, now: float) -> tuple[dict, bool]:
    if pending(state, action, now):
        return {}, True
    return {'action': action, 'at': now}, False


def runtime_file() -> Path:
    root = Path(os.environ.get('XDG_RUNTIME_DIR', f'/run/user/{os.getuid()}'))
    info = root.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('runtime directory must be owned by you and mode 0700')
    return root / 'leo-lock-power.json'


def command(action: str) -> list[str]:
    return ['systemctl', action] + ([] if action == 'suspend' else ['--no-wall'])


def main(args: list[str]) -> int:
    status = len(args) == 2 and args[0] == 'status' and args[1] in LABELS
    if not status and (len(args) != 1 or args[0] not in (*LABELS, 'suspend')):
        print(__doc__.strip(), file=sys.stderr)
        return 2
    action = args[-1]
    if action == 'suspend':
        return subprocess.run(command(action), check=False).returncode

    try:
        descriptor = os.open(runtime_file(), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'r+') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            os.fchmod(stream.fileno(), 0o600)
            try:
                state = json.load(stream)
                if not isinstance(state, dict) or not isinstance(state.get('at', 0), (int, float)):
                    state = {}
            except (ValueError, TypeError):
                state = {}
            # Same boot-time clock as /proc/uptime, used by the cheap shell
            # status reader. Suspending cannot extend a pending confirmation.
            now = time.clock_gettime(time.CLOCK_BOOTTIME)
            if status:
                print(('Confirm ' if pending(state, action, now) else '') + LABELS[action])
                return 0
            state, execute = transition(state, action, now)
            stream.seek(0)
            stream.truncate()
            json.dump(state, stream)
        if execute:
            return subprocess.run(command(action), check=False).returncode
        return 0
    except (OSError, ValueError) as error:
        print(f'lock power: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
