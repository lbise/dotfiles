// Open a file in Neovim: in a Neovim already running in the focused space (the
// focused tab's first) on the repo's machine, else in a new tab.

import { exec, focused, hc, panes, run, spaces } from "herdr";

// $1 a terminal's foreground pid, $2 a file. Its nvim's server socket is named after the
// nvim process or (0.10+, the TUI forks its server) a child of it. --remote-expr, unlike
// --remote, never falls back to editing locally. Exit 3: no socket.
const OPEN = `f=$(printf %s "$2" | sed "s/'/''/g")
for p in "$1" $(pgrep -P "$1"); do
  for s in "\${XDG_RUNTIME_DIR:-/nonexistent}/nvim.$p".* "\${TMPDIR:-/tmp}/nvim.$USER"/*/nvim."$p".*; do
    [ -S "$s" ] && exec nvim --server "$s" --remote-expr "execute('drop ' .. fnameescape('$f'))"
  done
done
exit 3`;

const machineOf = (address) => (address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : null);

/** Opens `path` (relative to the repo) in Neovim. */
export async function openInNvim(repo, path) {
  const file = `${repo.root}/${path}`;
  const f = focused();
  const tabs = spaces().find((s) => s.id === f?.space)?.tabs.map((t) => t.id) || [];
  const editors = panes()
    .filter((p) => p.terminal && p.program?.key === "nvim" && tabs.includes(p.tab) && machineOf(p.terminal) === (repo.on ?? null))
    .sort((a, b) => Number(b.tab === f.tab) - Number(a.tab === f.tab));
  for (const pane of editors) {
    const got = await hc(["get", "--json", pane.terminal]);
    const pid = got.code === 0 ? JSON.parse(got.stdout).foreground?.pid : null;
    if (!pid) continue;
    const result = await exec("sh", ["-lc", OPEN, "sh", String(pid), file], { on: repo.on, timeout: 10000 });
    if (result.code === 0) {
      run("pane.focus", { terminal: pane.terminal });
      return;
    }
  }
  run("terminal.open", { argv: ["sh", "-lc", 'exec nvim "$1"', "sh", file], folder: repo.root, place: "tab" });
}
