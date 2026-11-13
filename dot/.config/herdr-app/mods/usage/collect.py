# Pi's token usage on this machine, totalled per local day, provider, model and project.
# The usage mod runs it on every machine (python3 -c) and prints one JSON object:
#   {"rows": [[day, provider, model, project, messages, input, output, cacheRead, cacheWrite, reasoning, cost], ...]}
# The project is the session's folder, home as "~". A forked session repeats its
# parent's messages, so each response counts once.
import glob
import json
import os
import sys
from datetime import datetime

FIELDS = ("input", "output", "cacheRead", "cacheWrite", "reasoning")
HOME = os.path.expanduser("~")


def project_of(line):
    try:
        cwd = json.loads(line).get("cwd") or ""
    except ValueError:
        return "?"
    if cwd == HOME or cwd.startswith(HOME + "/"):
        cwd = "~" + cwd[len(HOME):]
    return cwd or "?"


def main(root):
    seen = set()
    totals = {}
    for path in glob.glob(os.path.join(root, "**", "*.jsonl"), recursive=True):
        try:
            lines = open(path, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with lines:
            project = project_of(lines.readline())
            for line in lines:
                if '"usage"' not in line:
                    continue
                try:
                    message = json.loads(line).get("message") or {}
                except ValueError:
                    continue
                usage = message.get("usage")
                if message.get("role") != "assistant" or not isinstance(usage, dict):
                    continue
                provider = message.get("provider") or "?"
                model = message.get("model") or "?"
                stamp = message.get("timestamp") or 0
                key = message.get("responseId") or (provider, model, stamp, usage.get("output"))
                if key in seen:
                    continue
                seen.add(key)
                day = datetime.fromtimestamp(stamp / 1000).strftime("%Y-%m-%d") if stamp else "?"
                row = totals.setdefault((day, provider, model, project), [0] * (len(FIELDS) + 2))
                row[0] += 1
                for i, field in enumerate(FIELDS):
                    row[i + 1] += usage.get(field) or 0
                row[-1] += (usage.get("cost") or {}).get("total") or 0
    rows = [list(k) + v for k, v in sorted(totals.items())]
    json.dump({"rows": rows}, sys.stdout, separators=(",", ":"))


main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/.pi/agent/sessions"))
