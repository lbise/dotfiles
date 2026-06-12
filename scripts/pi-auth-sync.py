#!/usr/bin/env python3
"""
Sync selected Pi auth.json providers from this machine to remote machines over SSH.

Default behavior: copy only the github-copilot credential and merge it into each
remote ~/.pi/agent/auth.json, preserving any other remote providers.

Examples:
  # After /login on this machine, push Copilot auth to hosts in ~/.scripts/work_machines.txt
  python3 scripts/pi-auth-sync.py

  # Or pass hosts explicitly
  python3 scripts/pi-auth-sync.py ch03wxuboard310 ch03wxuboard311

  # Read hosts from a custom file, one host per line (# comments allowed)
  python3 scripts/pi-auth-sync.py --hosts-file ~/.pi-hosts

  # Push all local auth providers instead of only github-copilot
  python3 scripts/pi-auth-sync.py --all ch03wxuboard310 ch03wxuboard311

  # Use a non-default remote agent dir
  python3 scripts/pi-auth-sync.py --remote-agent-dir /path/to/.pi/agent host1

Security notes:
  - This sends credentials over SSH stdin to the remote host.
  - Remote auth.json is written with mode 0600.
  - Existing remote auth.json is backed up before changes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shlex
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

DEFAULT_HOSTS_FILE = "~/.scripts/work_machines.txt"

REMOTE_SCRIPT = r'''
import datetime as dt
import json
import os
import stat
import sys
from pathlib import Path

payload = json.load(sys.stdin)
agent_dir = Path(payload["remote_agent_dir"]).expanduser()
auth_path = agent_dir / "auth.json"
providers = payload["providers"]
replace = bool(payload.get("replace", False))
dry_run = bool(payload.get("dry_run", False))

agent_dir.mkdir(parents=True, exist_ok=True)
os.chmod(agent_dir, 0o700)

existing = {}
backup_path = None
parse_error = None
if auth_path.exists():
    raw = auth_path.read_text(encoding="utf-8")
    try:
        existing = json.loads(raw) if raw.strip() else {}
        if not isinstance(existing, dict):
            parse_error = "auth.json root is not an object"
            existing = {}
    except Exception as exc:
        parse_error = str(exc)
        existing = {}

if replace:
    merged = dict(providers)
else:
    merged = dict(existing)
    merged.update(providers)

changed = existing != merged
if changed and not dry_run:
    if auth_path.exists():
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = auth_path.with_name(auth_path.name + ".bak-" + stamp)
        backup_path.write_text(auth_path.read_text(encoding="utf-8"), encoding="utf-8")
        os.chmod(backup_path, 0o600)
    tmp_path = auth_path.with_name(auth_path.name + ".tmp")
    tmp_path.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
    os.chmod(tmp_path, 0o600)
    os.replace(tmp_path, auth_path)
    os.chmod(auth_path, 0o600)
elif auth_path.exists() and not dry_run:
    os.chmod(auth_path, 0o600)

result = {
    "host": os.uname().nodename if hasattr(os, "uname") else None,
    "authPath": str(auth_path),
    "changed": changed,
    "dryRun": dry_run,
    "replace": replace,
    "updatedProviders": sorted(providers.keys()),
    "preservedProviders": sorted(k for k in existing.keys() if k not in providers),
    "backupPath": str(backup_path) if backup_path else None,
    "parseError": parse_error,
}
print(json.dumps(result, indent=2))
'''


def default_agent_dir() -> Path:
    return Path(os.environ.get("PI_CODING_AGENT_DIR", Path.home() / ".pi" / "agent")).expanduser()


def load_hosts(args: argparse.Namespace) -> List[str]:
    hosts: List[str] = []
    hosts_file = args.hosts_file
    if not hosts_file and not args.hosts:
        hosts_file = DEFAULT_HOSTS_FILE

    if hosts_file:
        hosts_path = Path(hosts_file).expanduser()
        if not hosts_path.exists():
            raise SystemExit(f"Hosts file not found: {hosts_path}")
        for line in hosts_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            hosts.append(line)
    hosts.extend(args.hosts)
    # Preserve order while deduping.
    seen = set()
    unique = []
    for host in hosts:
        if host not in seen:
            seen.add(host)
            unique.append(host)
    return unique


def load_selected_providers(auth_path: Path, providers: List[str], copy_all: bool) -> Dict[str, Any]:
    if not auth_path.exists():
        raise SystemExit(f"Local auth file not found: {auth_path}")
    try:
        data = json.loads(auth_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"Could not parse local auth file {auth_path}: {exc}")
    if not isinstance(data, dict):
        raise SystemExit(f"Local auth file root is not an object: {auth_path}")

    if copy_all:
        selected = data
    else:
        selected = {provider: data[provider] for provider in providers if provider in data}
        missing = [provider for provider in providers if provider not in data]
        if missing:
            raise SystemExit(
                "Missing provider(s) in local auth.json: "
                + ", ".join(missing)
                + f"\nRun /login here first, or change --providers. Local file: {auth_path}"
            )
    if not selected:
        raise SystemExit("No providers selected to sync.")
    return selected


def summarize_provider(provider: str, credential: Any) -> str:
    if not isinstance(credential, dict):
        return f"{provider}: <non-object>"
    typ = credential.get("type")
    expires = credential.get("expires")
    expires_iso = None
    if isinstance(expires, (int, float)):
        expires_iso = dt.datetime.fromtimestamp(expires / 1000, dt.timezone.utc).isoformat().replace("+00:00", "Z")
    return f"{provider}: type={typ}, expires={expires_iso or 'n/a'}"


def run_for_host(host: str, payload: Dict[str, Any], ssh_opts: List[str]) -> int:
    remote_cmd = "python3 -c " + shlex.quote(REMOTE_SCRIPT)
    cmd = ["ssh", *ssh_opts, host, remote_cmd]
    proc = subprocess.run(
        cmd,
        input=json.dumps(payload),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    print(f"\n== {host} ==")
    if proc.stdout.strip():
        print(proc.stdout.strip())
    if proc.stderr.strip():
        print(proc.stderr.strip(), file=sys.stderr)
    if proc.returncode != 0:
        print(f"ERROR: ssh command failed for {host} with exit code {proc.returncode}", file=sys.stderr)
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Pi auth.json providers to remote hosts over SSH.")
    parser.add_argument("hosts", nargs="*", help="SSH hostnames/aliases to update")
    parser.add_argument("--hosts-file", help=f"File containing SSH hosts, one per line; default when no hosts are passed: {DEFAULT_HOSTS_FILE}")
    parser.add_argument("--local-auth", default=str(default_agent_dir() / "auth.json"), help="Local auth.json path")
    parser.add_argument("--remote-agent-dir", default="~/.pi/agent", help="Remote Pi agent dir; default: ~/.pi/agent")
    parser.add_argument("--providers", default="github-copilot", help="Comma-separated providers to sync; default: github-copilot")
    parser.add_argument("--all", action="store_true", help="Sync all local auth providers")
    parser.add_argument("--replace", action="store_true", help="Replace remote auth.json instead of merging selected providers")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing remote files")
    parser.add_argument(
        "--accept-new-host-keys",
        action="store_true",
        help="Pass StrictHostKeyChecking=accept-new to ssh. This auto-trusts first-seen hosts but still blocks changed host keys.",
    )
    parser.add_argument(
        "--skip-host-key-check",
        action="store_true",
        help="DANGEROUS: disable ssh host key checking for this run.",
    )
    parser.add_argument("--ssh-option", action="append", default=[], help="Extra ssh -o option, repeatable, e.g. --ssh-option ConnectTimeout=5")
    args = parser.parse_args()

    hosts = load_hosts(args)
    if not hosts:
        parser.error(f"No hosts found. Add hosts, pass --hosts-file, or populate {DEFAULT_HOSTS_FILE}")

    providers = [p.strip() for p in args.providers.split(",") if p.strip()]
    selected = load_selected_providers(Path(args.local_auth).expanduser(), providers, args.all)

    print("Selected local providers:")
    for provider, credential in selected.items():
        print("  " + summarize_provider(provider, credential))
    print(f"Remote agent dir: {args.remote_agent_dir}")
    if args.replace:
        print("Mode: REPLACE remote auth.json")
    else:
        print("Mode: merge selected provider(s), preserving other remote providers")
    if args.dry_run:
        print("Dry run: no remote writes")

    ssh_opts: List[str] = []
    if args.accept_new_host_keys:
        ssh_opts.extend(["-o", "StrictHostKeyChecking=accept-new"])
    if args.skip_host_key_check:
        print("WARNING: --skip-host-key-check disables SSH host key verification for this run.", file=sys.stderr)
        ssh_opts.extend(["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null"])
    for opt in args.ssh_option:
        ssh_opts.extend(["-o", opt])

    payload = {
        "remote_agent_dir": args.remote_agent_dir,
        "providers": selected,
        "replace": args.replace,
        "dry_run": args.dry_run,
    }

    failures = 0
    for host in hosts:
        rc = run_for_host(host, payload, ssh_opts)
        if rc != 0:
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
