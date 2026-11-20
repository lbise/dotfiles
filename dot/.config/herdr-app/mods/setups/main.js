// Setups: the HIL setups among Herdr's machines and the upkeep they need. A setup is
// a remote machine whose ~/andromeda has a harness config for its hostname
// (infrastructure/config/<host>.*cfg). probe.py runs on every remote machine
// (python3 -c) on open, every few minutes and on Refresh: env, branches, work only that
// machine has, runs in progress and the latest sanity run. Machines once seen as setups
// stay listed while offline (localStorage "known").
// Actions open a terminal tab on the setup (in its space, else a new one) so their output
// and prompts show: dotfiles update, andromeda update (pull, extract, rebase) and env
// switch (extract --force). The andromeda ones wipe _obj, so they ask twice, and they are
// refused while a checkout has tracked changes (extract --force resets them) or a run of mine is going.
// A side panel (layouts/leo.json's `setups` block), opened from the Setups button in the
// tab bar or leo-tabs.setups, maximized with leo-tabs.max (mods/leo-tabs).

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, layout, machines, readTextFile, run, settings, spaces, theme } from "herdr";
import { blockers, family, groups, onlyHere, sanityLine, short, unpushed } from "./model.js";

const MONO = "Geist Mono";
const POLL_MS = 3 * 60 * 1000;
const TIMEOUT_MS = 60000;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const WIDE = 760; // design px from which a label column sits beside each line

export default class Setups extends View {
  init(_props, cx) {
    this.width = 0; // design px
    this.reports = {}; // machine -> its last probe report
    this.status = {}; // machine -> { state: "loading" | "ok" | "error", error }
    this.confirm = ""; // the action waiting for its second press
    try { this.known = new Set(JSON.parse(localStorage.getItem("known") || "[]")); } catch { this.known = new Set(); }
    if (checking()) return;
    cx.spawn(async (cx) => {
      this.script = await readTextFile(`${appHome()}/mods/setups/probe.py`);
      this.refresh(cx);
    });
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    if (!this.script) return;
    for (const { name } of machines().filter((m) => m.name)) {
      if (this.status[name]?.state === "loading") continue;
      this.status[name] = { state: "loading" };
      cx.spawn(async (cx) => {
        this.status[name] = await this.probe(name);
        cx.notify();
      });
    }
    cx.notify();
  }

  async probe(name) {
    try {
      const r = await exec("python3", ["-c", this.script], { on: name, timeout: TIMEOUT_MS });
      if (r.code !== 0) return { state: "error", error: (r.stderr || `exit ${r.code}`).trim().split("\n").pop() };
      const report = JSON.parse(r.stdout);
      const setup = report.andromeda && report.asics !== null;
      if (setup) this.reports[name] = report;
      else delete this.reports[name];
      if (setup !== this.known.has(name)) {
        setup ? this.known.add(name) : this.known.delete(name);
        localStorage.setItem("known", JSON.stringify([...this.known]));
      }
      return { state: "ok" };
    } catch (error) {
      return { state: "error", error: String(error.message || error).split("\n")[0] };
    }
  }

  /** Asks for a second press before `then` runs; the question goes away after a while. */
  confirmed(key, cx, then) {
    if (this.confirm === key) {
      this.confirm = "";
      return then();
    }
    this.confirm = key;
    cx.timer.after(3000, (cx) => { if (this.confirm === key) { this.confirm = ""; cx.notify(); } });
    cx.notify();
  }

  /** The space to work in on this setup: one in andromeda if there is, else its first. */
  space(name, folder) {
    const on = spaces().filter((s) => s.machine === name);
    return on.find((s) => s.folder.startsWith(folder)) || on[0];
  }

  open(name, report) {
    const folder = report.andromeda.path;
    const space = this.space(name, folder);
    if (space) run("space.select", { id: space.id });
    else run("space.new", { machine: name, folder });
  }

  /** Runs `script` in bash in a new tab on the setup; Herdr leaves a login shell there once it ends. */
  act(name, report, title, script) {
    const folder = report.andromeda.path;
    const argv = ["bash", "-lc", script];
    const space = this.space(name, folder);
    if (space) run("tab.new", { space: space.id, name: title, folder, argv });
    else run("space.new", { machine: name, folder, tab: title, argv });
  }

  render(cx) {
    const t = theme();
    const narrow = this.width < WIDE;
    const names = [...this.known].filter((n) => machines().some((m) => m.name === n)).sort();
    const loading = Object.values(this.status).some((s) => s.state === "loading");
    const waiting = !names.length && (loading || !this.script);

    const header = h_flex().items_center().gap(8)
      .child(div().font_semibold().child("Setups"))
      .child(div().flex_1())
      .when(loading, (el) => el.child(div().text_color(t.muted).frames(SPINNER, 90)))
      .child(iconButton(t, "refresh", "mods/review/icons/refresh.svg", (cx) => this.refresh(cx)))
      .child(maxButton(t));

    return v_flex().id("setups-root").size_full().bg(t.background).text_color(t.foreground).text_size(13)
      .p(narrow ? 12 : 18).gap(12).rounded(10).border_1().border_color(t.border).overflow_hidden()
      .on_size_change((size, cx) => {
        const width = size.width / (settings().zoom || 1);
        if (Math.abs(width - this.width) < 1) return;
        this.width = width;
        cx.notify();
      })
      .child(header)
      .child(v_flex().id("setups-list").flex_1().min_h(0).gap(10).overflow_y_scrollbar()
        .children(names.map((name) => this.card(t, name, narrow)))
        .when(!names.length, (el) => el.child(div().text_color(t.muted).child(waiting
          ? "Looking for setups…"
          : "No setups: no machine has ~/andromeda with a harness config for its hostname."))));
  }

  card(t, name, narrow) {
    const report = this.reports[name];
    const status = this.status[name] || { state: "loading" };
    const offline = status.state === "error";
    const head = h_flex().items_center().gap(8)
      .child(div().size(7).rounded(4).flex_none().bg(offline ? t.dim : t.foreground))
      .child(div().font_semibold().child(report ? short(report.host) : name))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted)
        .child(report ? [family(report.host), report.asics ? `${report.asics} ASIC` : ""].filter(Boolean).join(" · ") : ""))
      .when(!!report?.andromeda.env, (el) => el.child(div().font_family(MONO).text_size(12).text_color(t.muted).child(report.andromeda.env)))
      .when(!!report && !offline, (el) => el.child(button(t, `open-${name}`, "Open", true, () => this.open(name, report))));
    return v_flex().id(`setup-${name}`).gap(6).p(12).rounded(10).border(1).border_color(t.border).child(head)
      .when(offline, (el) => el.child(div().text_size(12).text_color(t.ansi1).truncate().child(`Unreachable: ${status.error}`)))
      .when(!!report, (el) => el.children(this.lines(t, name, report, narrow)))
      .when(!!report && !offline, (el) => el.child(this.actions(t, name, report)));
  }

  lines(t, name, report, narrow) {
    const line = (label, ...content) => (narrow
      ? v_flex().gap(2).child(div().text_size(11).text_color(t.dim).child(label)).children(content)
      : h_flex().gap(10).items_start().child(div().w(76).flex_none().text_size(12).text_color(t.dim).child(label))
        .child(v_flex().flex_1().min_w(0).gap(2).children(content)));
    const text = (s, color = t.muted) => div().text_size(12).text_color(color).child(s);
    const out = [];

    const pushed = unpushed(report.andromeda.repos);
    const all = groups(report.andromeda.repos), base = all.filter((g) => g.base);
    out.push(line("Branches",
      ...all.filter((g) => !g.base).map((g) => h_flex().gap(8).items_center().min_w(0)
        .child(div().font_family(MONO).text_size(12).truncate().child(g.branch))
        .child(div().flex_none().text_size(12).text_color(t.dim).child(g.names.join(" ")))),
      // The branches nothing is being done on, on one line.
      ...(base.length ? [div().font_family(MONO).text_size(12).text_color(t.muted)
        .child(base.map((g) => `${g.branch} ${g.names.join(" ")}`).join(" · "))] : []),
      ...(pushed.length ? [text(pushed.join(" · "), t.foreground)] : [])));

    const changes = blockers(report), kept = onlyHere(report);
    if (changes || kept) {
      out.push(line("Only here",
        ...(changes ? [text(`Uncommitted: ${changes}`, t.foreground)] : []),
        ...(kept ? [text(kept)] : [])));
    }

    const others = report.runs.filter((r) => !(r.mine && r.tool === "sanity"));
    const sanity = report.sanity;
    if (others.length || sanity) {
      out.push(line(sanity?.state === "running" ? "Running" : "Tests",
        ...others.map((r) => h_flex().gap(6).items_center().min_w(0)
          .child(div().flex_none().text_color(t.muted).frames(SPINNER, 90))
          .child(text(`${r.mine ? "" : `${r.user}: `}${r.tool}.py ${r.args}`, r.mine ? t.foreground : t.muted).truncate())),
        ...(sanity ? [h_flex().gap(6).items_center().min_w(0)
          .when(sanity.state === "running", (el) => el.child(div().flex_none().text_color(t.muted).frames(SPINNER, 90)))
          .child(text(`Sanity ${sanityLine(sanity)}`, sanity.state === "running" ? t.foreground : t.muted).truncate())
          .when(!!sanity.url, (el) => el.child(link(t, `report-${name}`, "Report", (cx) => cx.open_url(sanity.url))))] : []),
        ...(sanity?.failed.length ? [text(`Failed: ${sanity.failed.join(", ")}`, t.ansi1)] : [])));
    }

    const d = report.dotfiles;
    out.push(line("Dotfiles", text(!d ? "not installed" : d.behind ? `${d.behind} behind` : d.behind === 0 ? "up to date" : `on ${d.branch}, no upstream`,
      d?.behind ? t.foreground : t.muted)));
    return out;
  }

  actions(t, name, report) {
    const a = report.andromeda;
    // Someone else's run uses their own checkout; only mine would break under an extract.
    const busy = report.runs.some((r) => r.mine);
    const changes = blockers(report);
    // extract --force resets tracked changes; any extract under a running test breaks it.
    const why = changes ? `Commit or stash first: ${changes}` : busy ? "A test is running" : "";
    const quoted = `'${a.path.replace(/'/g, "'\\''")}'`;
    const andromeda = (key, label, title, script) => {
      const asking = this.confirm === key;
      return button(t, key, asking ? "Wipes _obj: press again" : label, !why, (cx) => this.confirmed(key, cx, () =>
        this.act(name, report, title, `cd ${quoted} && source sourceme && ${script}`)), asking);
    };
    const env = a.env && /^[\w.-]+$/.test(a.env) ? a.env : null;
    return v_flex().gap(6).pt(4)
      .child(h_flex().gap(6).flex_wrap().items_center()
        .child(button(t, `dot-${name}`, "Update dotfiles", !!report.dotfiles, () =>
          this.act(name, report, "dotfiles", `"$HOME/.scripts/dotfiles" update`)))
        .when(!!env, (el) => el.child(andromeda(`upd-${name}`, "Update andromeda", "andromeda update",
          `git pull --rebase && python3 swcmp.py extract ${env} && python3 swcmp.py update`)))
        .children(a.envs.filter((e) => e !== a.env).map((e) => andromeda(`env-${name}-${e}`, `Switch to ${e}`, `extract ${e}`,
          `python3 swcmp.py extract ${e} --force`))))
      .when(!!why, (el) => el.child(div().text_size(12).text_color(t.muted).child(why)));
  }
}

function button(t, id, text, enabled, onClick, warn = false) {
  return h_flex().id(id).h(26).px(10).flex_none().items_center().rounded(6).border(1)
    .border_color(warn ? t.ansi1 : t.border).bg(t.background)
    .text_size(12).text_color(!enabled ? t.dim : warn ? t.ansi1 : t.muted)
    .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.raised).text_color(warn ? t.ansi1 : t.foreground))
      .on_click((_e, cx) => onClick(cx)))
    .child(text);
}

function link(t, id, text, onClick) {
  return div().id(id).flex_none().text_size(12).text_color(t.muted).cursor_pointer()
    .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => onClick(cx)).child(`${text} ↗`);
}

function iconButton(t, id, icon, onClick) {
  return h_flex().id(id).size(26).flex_none().items_center().justify_center().rounded(6).border(1).border_color(t.border)
    .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground))
    .on_click((_e, cx) => onClick(cx))
    .child(svg(icon).size(14));
}

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** The maximize button every side panel has (leo-tabs does the work). */
function maxButton(t) {
  const max = findNode(layout(), "chat-view")?.hidden === true;
  return iconButton(t, "panel-max", `mods/review/icons/${max ? "unzoom" : "zoom"}.svg`, () => run("leo-tabs.max"));
}
