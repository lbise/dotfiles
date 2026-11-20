// What the setups board shows of a probe report (probe.py). No Herdr calls: tested in model.test.mjs.

// Branches every component sits on when nothing is being worked on.
const BASE = /^(master|main|to\d+\/master|rel\/.+)$/;

/** "ch03wxuboard310" → "uboard310". */
export const short = (host) => host.replace(/^ch03wx/, "");

/** The setup type from the hostname's last two digits: "ch03wxuboard310" → "UBOARD3"; "" when it does not fit. */
export function family(host) {
  const m = /^ch03wx(.+?)\d{2}$/.exec(host);
  return m ? m[1].toUpperCase() : "";
}

/** Source components grouped by branch, work branches first: [{ branch, names, base }]. */
export function groups(repos) {
  const by = new Map();
  for (const r of repos.filter((r) => r.src)) by.set(r.branch, [...(by.get(r.branch) || []), r.name]);
  return [...by].map(([branch, names]) => ({ branch, names, base: BASE.test(branch) }))
    .sort((a, b) => a.base - b.base || b.names.length - a.names.length);
}

/** Source components whose current branch has commits no remote has: ["rom ↑2", "apps not pushed"]. */
export function unpushed(repos) {
  return repos.filter((r) => r.src).flatMap((r) => {
    if (r.ahead) return [`${r.name} ↑${r.ahead}`];
    // A detached checkout shows its short hash instead of a branch.
    if (!r.upstream && !BASE.test(r.branch) && !/^[0-9a-f]{7,}$/.test(r.branch)) return [`${r.name} not pushed`];
    return [];
  });
}

/** Andromeda checkouts with tracked changes, which `c extract --force` would wipe: "rom 3, top 1" or "". */
export function blockers(report) {
  return (report.andromeda?.repos || []).filter((r) => r.changed).map((r) => `${r.name} ${r.changed}`).join(", ");
}

/** What only this machine keeps, besides tracked changes: "2 untracked · 5 stashes · 48 local-only commits" or "". */
export function onlyHere(report) {
  const repos = [...(report.andromeda?.repos || []), ...(report.dotfiles ? [report.dotfiles] : [])];
  const sum = (key) => repos.reduce((n, r) => n + (r[key] || 0), 0);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  return [
    sum("untracked") && plural(sum("untracked"), "untracked file", "untracked files"),
    sum("stashes") && plural(sum("stashes"), "stash", "stashes"),
    sum("local") && plural(sum("local"), "local-only commit", "local-only commits"),
  ].filter(Boolean).join(" · ");
}

/** "now", "5m", "3h", "2d" since an epoch in seconds. */
export function ago(at, now = Date.now()) {
  const s = Math.max(0, now / 1000 - at);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** The latest sanity run in one line: "to4_app_ub3_reg · Audio path · 12 done, 1 failed". */
export function sanityLine(s, now = Date.now()) {
  const failed = s.failed.length ? `, ${s.failed.length} failed` : "";
  if (s.state === "running") return `${s.name} · ${s.step || "starting"} · ${s.done} done${failed}`;
  const end = s.state === "done" ? (s.failed.length ? `${s.failed.length} failed` : "all passed") : "stopped";
  return `${s.name} · ${ago(s.at, now)} ago · ${end}`;
}
