// The Subscriptions tab: each subscription's current limits, read by subs.mjs
// on the machines in turn until every provider has answered (one machine
// usually does; the next ones cover a token expired or a machine down).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec } from "herdr";
import { formatReset, formatTokens, onOf } from "./model.js";

const MONO = "Geist Mono";

// exec runs without the shell's profile, so the PATH's node can be the system's old
// one. Use Pi's own (pi-node: Pi's managed install; pi-runtime: ~/.local/bin/pi on
// the boards), else nvm's newest, else the PATH's: the first that can import
// TypeScript (22+).
const RUN_NODE = `
for n in "\${XDG_DATA_HOME:-$HOME/.local/share}/pi-node/current/bin/node" "$HOME/.local/share/pi-runtime/node/bin/node" $(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V -r) "$(command -v node)"; do
  [ -x "$n" ] && "$n" -e 'process.exit(parseInt(process.versions.node) < 22 ? 1 : 0)' 2>/dev/null &&
    exec "$n" --no-warnings --experimental-strip-types --input-type=module -e "$1"
done
echo "no node 22 or newer" >&2
exit 127`;

/** @returns {Promise<{providers: object[], errors: string[]}>} */
export async function loadSubs(names, script) {
  const found = new Map();
  const errors = [];
  if (!script) return { providers: [], errors: ["subs.mjs not found"] };
  for (const machine of names) {
    try {
      const r = await exec("sh", ["-c", RUN_NODE, "usage-subs", script], { on: onOf(machine), timeout: 30000 });
      if (r.code !== 0) {
        errors.push(`${machine}: ${(r.stderr || `exit ${r.code}`).trim().split("\n").pop()}`);
        continue;
      }
      for (const p of JSON.parse(r.stdout).providers) {
        const had = found.get(p.id);
        if (!had || (had.error && p.snapshot)) found.set(p.id, { ...p, machine });
      }
    } catch (error) {
      errors.push(`${machine}: ${String(error.message || error).split("\n")[0]}`);
    }
    if (found.size && [...found.values()].every((p) => p.snapshot)) break;
  }
  return { providers: [...found.values()], errors };
}

function toneColor(t, tone) {
  return { warning: t.ansi3, error: t.ansi1, success: t.ansi2, dim: t.dim }[tone] || null;
}

function segments(t, list, fallback) {
  return h_flex().gap(0).font_family(MONO).text_size(12).children((list || []).map((s) =>
    div().text_color(toneColor(t, s.tone) || fallback).when(!!s.bold, (el) => el.font_semibold()).child(s.text)));
}

// A limit window: its share used as a bar (amber from 70 %, rose from 90 %, as the
// chat's status bar), a pace mark where an even spend would be, used/limit, reset.
// Narrow: the bar on one line, the figures under it.
function windowRow(t, w, narrow) {
  const percent = Math.max(0, Math.min(100, w.usedPercent));
  const fill = toneColor(t, w.tone) || (percent >= 90 ? t.ansi1 : percent >= 70 ? t.ansi3 : t.foreground);
  const bar = h_flex().h(28).gap(12).items_center()
    .child(div().w(64).flex_none().text_size(12).text_color(t.muted).child(w.label || ""))
    .child(div().flex_1().min_w(narrow ? 40 : 80).h(8).rounded(4).bg(t.raised).relative()
      .child(div().h_full().rounded(4).w(`${percent}%`).bg(fill))
      .when(w.markerPercent !== undefined, (el) => el.child(div().absolute().top(-3).h(14).w(2).rounded(1)
        .left(`${Math.max(0, Math.min(100, w.markerPercent))}%`).bg(t.muted))))
    .child(h_flex().w(52).flex_none().justify_end().font_family(MONO).text_size(12).text_color(fill === t.foreground ? t.foreground : fill)
      .child(`${Math.round(w.usedPercent)}%`));
  const used = div().font_family(MONO).text_size(12).text_color(t.muted)
    .child(w.used !== undefined && w.limit !== undefined ? `${formatTokens(w.used)}/${formatTokens(w.limit)}` : "");
  const resets = div().font_family(MONO).text_size(12).text_color(t.dim).child(w.resetsAt ? `resets ${formatReset(w.resetsAt)}` : "");
  if (narrow) {
    return v_flex()
      .child(bar)
      .child(h_flex().pl(76).gap(10).flex_wrap().items_center().child(used).child(segments(t, w.note, t.muted)).child(resets));
  }
  return bar
    .child(used.w(110).flex_none())
    .child(div().w(70).flex_none().child(segments(t, w.note, t.muted)))
    .child(resets.w(110).flex_none());
}

/**
 * @param {object} t theme
 * @param {{state: "idle" | "loading" | "ok", providers: object[], errors: string[], at: number}} subs
 * @param {Record<string, string>} notes a line per provider id under its limits
 * @param {boolean} narrow laid out for the side panel
 */
export function subsView(t, subs, notes, narrow) {
  if (subs.state !== "ok") {
    return div().p(14).text_color(t.muted).child(div().frames(["Reading limits ⠋", "Reading limits ⠙", "Reading limits ⠹", "Reading limits ⠸", "Reading limits ⠼", "Reading limits ⠴", "Reading limits ⠦", "Reading limits ⠧", "Reading limits ⠇", "Reading limits ⠏"], 90));
  }
  const at = new Date(subs.at);
  const card = (p) => {
    const snap = p.snapshot || {};
    const windows = [snap.primary, snap.secondary].filter(Boolean);
    return v_flex().gap(6).p(narrow ? 10 : 14).rounded(10).border(1).border_color(t.border)
      .child(h_flex().items_center().gap(8)
        .child(div().flex_none().font_semibold().child(p.name))
        .child(div().min_w(0).truncate().text_size(12).text_color(t.dim).child(p.id))
        .child(div().flex_1())
        .child(div().flex_none().text_size(12).text_color(t.dim).child(p.machine ? `via ${p.machine}` : "")))
      .when(!!p.error, (el) => el.child(div().text_color(t.ansi1).child(p.error)))
      .children(windows.map((w) => windowRow(t, w, narrow)))
      .when(!windows.length && !!snap.summary, (el) => el.child(h_flex().h(28).gap(12).items_center()
        .child(div().w(64).flex_none().text_size(12).text_color(t.muted).child(snap.summaryLabel || ""))
        .child(segments(t, snap.summary, t.foreground))))
      .when(!!(snap.extra && snap.extra.length), (el) => el.child(h_flex().h(28).gap(12).items_center()
        .child(div().w(64).flex_none().text_size(12).text_color(t.muted).child(p.extraLabel || "Extra"))
        .child(segments(t, snap.extra, t.foreground))))
      .when(!!notes[p.id], (el) => el.child(div().text_size(12).text_color(t.muted).child(notes[p.id])));
  };
  return v_flex().gap(12)
    .children(subs.providers.map(card))
    .when(!subs.providers.length, (el) => el.child(div().text_color(t.muted).child("No subscription answered")))
    .children((subs.providers.every((p) => p.snapshot) && subs.providers.length ? [] : subs.errors).map((e) => div().text_size(12).text_color(t.ansi1).child(e)))
    .child(div().font_family(MONO).text_size(11).text_color(t.dim)
      .child(`Read ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")} · bars: share used · tick: an even pace through the period`));
}
