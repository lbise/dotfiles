// Pictures Pi read, shown in their opened step. `image()` draws only files under
// the app's folder, so each picture is copied there from Pi's machine on first
// sight (`hc exec … base64`, decoded on this machine) into data/pi-chat-images/.
// Copies older than a day go when the next one is made.

import { appHome, exec } from "herdr";

const DIR = "data/pi-chat-images";
const TIMEOUT = 60000;
const EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp)$/i;

/** @type {Map<string, { machine: string|null, path: string, status: "wanted"|"loading"|"ready"|"failed", rel: string|null }>} */
const images = new Map();

const quote = (text) => `'${String(text).replace(/'/g, "''")}'`; // PowerShell

/**
 * A picture on Pi's machine; asked for on the next `loadImages`.
 * `status`: wanted, loading, ready (`rel`: its path under the app's folder, for `image()`), failed.
 * @param {string|null} machine
 * @param {string} path Absolute, on that machine.
 */
export function imageFor(machine, path) {
  const key = `${machine || ""}|${path}`;
  let entry = images.get(key);
  if (!entry) images.set(key, (entry = { machine, path, status: "wanted", rel: null }));
  return entry;
}

async function copy(entry) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${(EXTENSIONS.exec(entry.path) || [".png"])[0].toLowerCase()}`;
  const rel = `${DIR}/${name}`;
  const home = appHome();
  let result;
  if (home.includes("\\")) {
    // Windows: Pi always runs on another machine (WSL counts as one).
    if (!entry.machine) throw new Error("no machine");
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$dest = ${quote(`${home}\\${rel.replace(/\//g, "\\")}`)}`,
      "$dir = Split-Path -Parent $dest",
      "New-Item -ItemType Directory -Force $dir | Out-Null",
      "Get-ChildItem $dir -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force",
      `$b = (& hc exec --on ${quote(entry.machine)} base64 -w0 ${quote(entry.path)}) -join ''`,
      "if ($LASTEXITCODE -ne 0 -or -not $b) { exit 3 }",
      "[IO.File]::WriteAllBytes($dest, [Convert]::FromBase64String($b))",
    ].join("; ");
    result = await exec("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: TIMEOUT });
  } else {
    const script = 'set -e; d=$(dirname "$3"); mkdir -p "$d"; find "$d" -type f -mtime +1 -delete; if [ -n "$1" ]; then hc exec --on "$1" base64 -w0 "$2" | base64 -d > "$3"; else cp "$2" "$3"; fi';
    result = await exec("sh", ["-c", script, "pi-chat", entry.machine || "", entry.path, `${home}/${rel}`], { timeout: TIMEOUT });
  }
  if (result.code !== 0) throw new Error(result.stderr.trim() || `exit ${result.code}`);
  return rel;
}

/** Starts copying the pictures asked for since the last call; each one that lands redraws. */
export function loadImages(cx) {
  for (const entry of images.values()) {
    if (entry.status !== "wanted") continue;
    entry.status = "loading";
    cx.spawn(async (cx) => {
      try {
        entry.rel = await copy(entry);
        entry.status = "ready";
      } catch {
        entry.status = "failed";
      }
      cx.notify();
    });
  }
}
