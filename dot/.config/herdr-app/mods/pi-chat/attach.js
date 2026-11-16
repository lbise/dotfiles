// Files for the reply box: pasted, dropped or picked, each is first copied into
// data/pi-chat-uploads/ (so a picture can show as a thumbnail; `image()` draws only
// files under the app's folder), then on send uploaded to Pi's machine
// (`hc exec -i … base64 -di`) into a folder only its user reads. Copies older than
// a day go when the next ones are made.

import { appHome, exec } from "herdr";
import { IMAGE, shownName } from "./model/attach.js";

const DIR = "data/pi-chat-uploads";
const PICK_TIMEOUT = 600000; // the file dialog waits for the person
const TIMEOUT = 60000;

const quote = (text) => `'${String(text).replace(/'/g, "''")}'`; // PowerShell

// Where the files come from: each sets $paths, or saves the clipboard's picture itself.
const SOURCES = {
  paste: [
    "$img = [Windows.Forms.Clipboard]::GetImage()",
    "if ($img) { $n = \"$stamp-0-pasted.png\"; $img.Save((Join-Path $dir $n), [Drawing.Imaging.ImageFormat]::Png); $n } else { $paths = @([Windows.Forms.Clipboard]::GetFileDropList()) }",
  ],
  pick: [
    "$d = New-Object Windows.Forms.OpenFileDialog -Property @{ Multiselect = $true; Title = 'Attach to the message' }",
    "$owner = New-Object Windows.Forms.Form -Property @{ TopMost = $true }",
    "if ($d.ShowDialog($owner) -eq 'OK') { $paths = $d.FileNames }",
  ],
};

function windowsHome() {
  const home = appHome();
  // shortcut: Windows only (PowerShell and its clipboard); add wl-paste/zenity paths if the app runs on Linux.
  if (!home.includes("\\")) throw new Error("attaching files needs the Windows app");
  return home;
}

/**
 * Copies files into the staging folder.
 * @param {"paste"|"pick"|"drop"} how
 * @param {string[]} [paths] For "drop": absolute paths on this computer.
 * @returns {Promise<{ rel: string, name: string, image: boolean }[]>} Nothing when the clipboard held no file or the dialog was cancelled.
 */
export async function stageFiles(how, paths = []) {
  const home = windowsHome();
  const source = how === "drop" ? [`$paths = @(${paths.map(quote).join(", ")})`] : SOURCES[how];
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms, System.Drawing",
    `$dir = ${quote(`${home}\\${DIR.replace(/\//g, "\\")}`)}`,
    "New-Item -ItemType Directory -Force $dir | Out-Null",
    "Get-ChildItem $dir -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force",
    "$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss-fff')",
    "$paths = @()",
    ...source,
    "$i = 0",
    // Folders are skipped: only files go to Pi.
    "foreach ($p in $paths) { if (Test-Path -LiteralPath $p -PathType Leaf) { $i++; $n = \"$stamp-$i-\" + ([IO.Path]::GetFileName($p) -replace '[^\\w.-]', '_'); Copy-Item -LiteralPath $p -Destination (Join-Path $dir $n); $n } }",
  ].join("; ");
  const result = await exec("powershell", ["-NoProfile", "-NonInteractive", "-STA", "-Command", script], { timeout: how === "pick" ? PICK_TIMEOUT : TIMEOUT });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `exit ${result.code}`);
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((name) => ({ rel: `${DIR}/${name}`, name: shownName(name), image: IMAGE.test(name) }));
}

/**
 * Uploads a staged file to Pi's machine. Resolves with its absolute path there.
 * @param {string} machine
 * @param {string} rel A staged file's `rel`.
 */
export async function uploadFile(machine, rel) {
  const home = windowsHome();
  const name = rel.replace(/.*\//, ""); // staged names are [\w.-] only: no quoting needed on the far side
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$b = [Convert]::ToBase64String([IO.File]::ReadAllBytes(${quote(`${home}\\${rel.replace(/\//g, "\\")}`)}))`,
    // -i: PowerShell ends what it pipes with CRLF, which plain base64 -d refuses.
    `$b | & hc exec -i --on ${quote(machine)} sh -c 'umask 077; d=\${TMPDIR:-/tmp}/herdr-chat-uploads-$(id -u); mkdir -p $d && base64 -di > $d/$1 && printf %s $d/$1' sh ${quote(name)}`,
    "if ($LASTEXITCODE -ne 0) { exit 3 }",
  ].join("; ");
  const result = await exec("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: TIMEOUT });
  const path = result.stdout.trim();
  if (result.code !== 0 || !path.startsWith("/")) throw new Error(result.stderr.trim() || `exit ${result.code}`);
  return path;
}
