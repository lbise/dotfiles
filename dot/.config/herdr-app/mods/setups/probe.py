#!/usr/bin/env python3
"""What a HIL setup holds right now, read on the setup itself.

The setups mod runs it on each Herdr machine (python3 -c), dotfiles-fleet over ssh
(python3 - [--text|--unsaved] < probe.py). Read-only, except a quiet `git fetch` of
the dotfiles checkout so "behind" is current.

  (no option)  JSON for the mod
  --text       a few lines for people (dotfiles-fleet check)
  --unsaved    what would be left behind, one line each; exit 1 if anything (dotfiles-fleet release)
"""

import json
import os
import pwd
import re
import socket
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HOME = Path.home()
ANDROMEDA = HOME / "andromeda"
SANITY_URL = "https://ch03rdteam.phonak.com/shannon_sanity/{run}-{host}/index.html"


def git(repo, *args, timeout=30):
    try:
        r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def lines(text):
    return len(text.splitlines()) if text else 0


def repo(path, name, src=True, fetch=False):
    """A checkout's branch and the work in it that no remote has."""
    if fetch:
        git(path, "fetch", "-q", "--no-tags", timeout=15)
    branch = git(path, "symbolic-ref", "--short", "-q", "HEAD")
    counts = git(path, "rev-list", "--left-right", "--count", "HEAD...@{u}") if branch else None
    ahead, behind = (int(n) for n in counts.split()) if counts else (None, None)
    status = (git(path, "status", "--porcelain") or "").splitlines()
    untracked = sum(1 for line in status if line.startswith("??"))
    return {
        "name": name,
        "src": src,
        "branch": branch or git(path, "rev-parse", "--short", "HEAD") or "?",
        "upstream": counts is not None,
        "ahead": ahead,
        "behind": behind,
        # Tracked changes are what `c extract --force` destroys (checkout --force, reset --hard);
        # untracked files survive it but are still work only this machine has.
        "changed": len(status) - untracked,
        "untracked": untracked,
        "stashes": lines(git(path, "stash", "list")),
        # Commits on local branches that no remote branch has, extract_* snapshots included.
        "local": int(git(path, "rev-list", "--count", "--branches", "--not", "--remotes") or 0),
    }


def read(path):
    try:
        return Path(path).read_text(errors="replace")
    except OSError:
        return ""


def andromeda():
    if not (ANDROMEDA / ".git").exists():
        return None
    extracted = read(ANDROMEDA / "component/extracted_components.txt")
    env = re.search(r"^SW_ENV\s*=\s*(\S+)", extracted, re.M)
    src = set(re.findall(r"^(\S+)\s*\[type=src\b", extracted, re.M))
    # Every checkout counts for unsaved work, binary components with an old clone too.
    names = sorted(p.parent.name for p in ANDROMEDA.glob("*/.git"))
    with ThreadPoolExecutor(8) as pool:
        repos = list(pool.map(lambda n: repo(ANDROMEDA / n, n, n in src), names))
    envs = sorted(p.name for p in (ANDROMEDA / "infrastructure/env").glob("to*") if re.fullmatch(r"to\d+", p.name))
    return {
        "path": str(ANDROMEDA),
        "env": env.group(1) if env else None,
        "envs": envs,
        "repos": [repo(ANDROMEDA, "top")] + repos,
    }


def asics(host):
    """Boards on the harness, counted like andromeda's get_nb_shannon_p (without its version filter)."""
    cfgs = sorted((ANDROMEDA / "infrastructure/config").glob(host + ".*cfg"))
    if not cfgs:
        return None
    sections = re.split(r"^\[.*\]\s*$", read(cfgs[0]), flags=re.M)
    return sum(1 for s in sections if re.search(r"^\s*(uart_shannon_p_trace|shannon_p_uid)\s*=", s, re.M))


def running():
    """sanity.py and build.py runs on this machine, whoever started them."""
    found = []
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit() or int(proc.name) == os.getpid():
            continue
        try:
            argv = (proc / "cmdline").read_bytes().decode(errors="replace").split("\0")
            uid = proc.stat().st_uid
        except OSError:
            continue
        tool = next((Path(a).stem for a in argv if Path(a).name in ("sanity.py", "build.py")), None)
        if not tool:
            continue
        try:
            user = pwd.getpwuid(uid).pw_name
        except KeyError:
            user = str(uid)
        args = argv[next(i for i, a in enumerate(argv) if Path(a).stem == tool) + 1:]
        found.append({"tool": tool, "args": " ".join(a for a in args if a), "user": user, "mine": uid == os.getuid()})
    # A sanity run starts build.py for each step: its own builds are not news.
    sanity = {r["user"] for r in found if r["tool"] == "sanity"}
    return [r for r in found if r["tool"] == "sanity" or r["user"] not in sanity]


def sanity(host, runs):
    """The latest sanity run here: its steps from progress.txt."""
    root = ANDROMEDA / "sanity"
    dirs = sorted(p for p in root.glob("[0-9]*_*") if p.is_dir()) if root.is_dir() else []
    if not dirs:
        return None
    run = dirs[-1]
    steps = {}
    for line in read(run / "progress.txt").splitlines():
        m = re.fullmatch(r"(.+) return code (-?\d+)", line.strip())
        if m:
            steps[m.group(1)] = int(m.group(2))
        elif line.strip().endswith(" will start"):
            steps[line.strip()[: -len(" will start")]] = None
    if (run / "index.html").exists():
        state = "done"
    elif any(r["tool"] == "sanity" and r["mine"] for r in runs):
        state = "running"
    else:
        state = "stopped"
    try:
        at = int(time.mktime(time.strptime(run.name[:15], "%Y%m%d_%H%M%S")))
    except ValueError:
        at = int(run.stat().st_mtime)
    current = [name for name, code in steps.items() if code is None]
    return {
        "name": run.name[16:],
        "at": at,
        "state": state,
        "step": current[-1] if current and state == "running" else None,
        "done": sum(1 for code in steps.values() if code is not None),
        "failed": [name for name, code in steps.items() if code not in (None, 0)],
        # Only finished runs are uploaded; old ones are cleaned from the server.
        "url": SANITY_URL.format(run=run.name, host=host) if state == "done" else None,
    }


def dotfiles():
    scripts = HOME / ".scripts"
    if not scripts.exists():
        return None
    return repo(Path(os.path.realpath(scripts)).parent, "dotfiles", fetch=True)


def probe():
    host = socket.gethostname().split(".")[0]
    runs = running()
    return {
        "host": host,
        "home": str(HOME),
        "asics": asics(host),
        "andromeda": andromeda(),
        "dotfiles": dotfiles(),
        "runs": runs,
        "sanity": sanity(host, runs),
    }


def unsaved(report):
    """Work that only this machine has, one line per checkout."""
    out = []
    repos = (report["andromeda"] or {}).get("repos", []) + ([report["dotfiles"]] if report["dotfiles"] else [])
    for r in repos:
        parts = []
        if r["changed"]:
            parts.append(f"{r['changed']} uncommitted")
        if r["untracked"]:
            parts.append(f"{r['untracked']} untracked")
        if r["stashes"]:
            parts.append(f"{r['stashes']} stashed")
        if r["local"]:
            parts.append(f"{r['local']} local-only commits")
        if parts:
            out.append(f"{r['name']}: {', '.join(parts)}")
    return out


def text(report):
    a, d, s = report["andromeda"], report["dotfiles"], report["sanity"]
    head = report["host"] + (f"  {report['asics']} ASIC" if report["asics"] else "")
    out = [head + (f"  env {a['env']}" if a else "  no ~/andromeda")]
    if a:
        work = [f"{r['name']} {r['branch']}" for r in a["repos"] if r["src"]]
        out.append("  andromeda  " + ", ".join(work))
    if d:
        out.append("  dotfiles   " + (f"{d['behind']} behind" if d["behind"] else "up to date"))
    for r in report["runs"]:
        out.append(f"  running    {r['tool']} {r['args']}" + ("" if r["mine"] else f" ({r['user']})"))
    if s and s["state"] != "running":
        failed = f", failed: {', '.join(s['failed'])}" if s["failed"] else ""
        out.append(f"  sanity     {s['name']} {s['state']} {time.strftime('%Y-%m-%d %H:%M', time.localtime(s['at']))}{failed}")
    out += ["  unsaved    " + line for line in unsaved(report)]
    return "\n".join(out)


def main():
    report = probe()
    if "--unsaved" in sys.argv:
        found = unsaved(report)
        print("\n".join(found))
        sys.exit(1 if found else 0)
    print(text(report) if "--text" in sys.argv else json.dumps(report))


main()
