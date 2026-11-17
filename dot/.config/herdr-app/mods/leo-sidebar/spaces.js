// The spaces as cards, in Herdr's order, not grouped by machine: the machine is a
// quiet tag on the card until it cannot be reached, then the card says so loudly.
// A machine in trouble with no space shown gets a card of its own, which can be
// put away until its state changes. Clicking a machine tag hides that machine's
// spaces and agents (shared "leo-sidebar.hidden"); the foot of the list brings it
// back. Click to switch, right-click for the space menu, drag to reorder (within a
// machine, as Herdr allows).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { openOverlay, run, setShared, shared, spaces, theme } from "herdr";
import { machineLabel } from "./data.js";
import { hiddenMachines, knownMachines, setHidden, stateOf } from "./live.js";
import { MONO, alertStrip, card, chrome, machineTag, mark } from "./ui.js";

// The spaces mod's avatar colours, so a space keeps its colour across layouts.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];

export class SpacesView {
  constructor() {
    this.pressed = null;
    this.over = null;
    try { this.dismissed = JSON.parse(localStorage.getItem("dismissed") ?? "{}"); } catch { this.dismissed = {}; }
    if (!this.dismissed || typeof this.dismissed !== "object" || Array.isArray(this.dismissed)) this.dismissed = {};
  }

  // Every space gets a colour, the least used first; the spaces mod does the same.
  colors(sp) {
    const ids = new Set(sp.map((s) => s.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const s of sp) {
      if (kept[s.id] || s.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[s.id] = PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    return kept;
  }

  /** The spaces the list shows, in its order. */
  visible() {
    const hidden = hiddenMachines();
    return spaces().filter((s) => !hidden.has(s.machine ?? ""));
  }

  /** Alt+N (keys.json "layout:leo"): the Nth space of this list, hidden ones skipped. */
  command(command) {
    const n = /^space-([1-9])$/.exec(command)?.[1];
    const space = n && this.visible()[Number(n) - 1];
    if (space) run("space.select", { id: space.id });
  }

  render() {
    const t = theme();
    const all = spaces();
    const colors = this.colors(all);
    const hidden = hiddenMachines();
    const sp = this.visible();
    const away = [...hidden].map((m) => ({ m, n: all.filter((s) => (s.machine ?? "") === m).length }));
    const withSpaces = new Set(sp.map((s) => s.machine).filter(Boolean));
    const lone = knownMachines()
      .map((m) => ({ name: m.name, state: stateOf(m.name) }))
      .filter((m) => !withSpaces.has(m.name) && !hidden.has(m.name) && m.state !== "ok" && this.dismissed[m.name] !== m.state);
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13).border_t(1).border_color(t.border)
      .child(h_flex().h(36).flex_none().pt(4).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .child("Spaces")
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("New space")
          .on_click(() => run("space.new")).child(chrome("plus", 14))))
      .child(v_flex().id("lsb-spaces").flex_1().min_h(0).px(10).pb(10).gap(6).overflow_y_scrollbar()
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children([...lone.map((m) => this.machineCard(t, m)), ...sp.map((s, i) => this.card(t, s, i, colors))]))
      // Hidden machines, each a click away from coming back.
      .when(away.length > 0, (el) => el.child(h_flex().flex_none().flex_wrap().px(16).py(8).gap(6).items_center().border_t(1).border_color(t.border)
        .text_size(11.5).text_color(t.dim)
        .child("Hidden:")
        .children(away.map(({ m, n }) => div().id(`unhide-${m || "local"}`).px(6).py(1).rounded(5).font_family(MONO)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Show it again")
          .on_click(() => setHidden(m, false))
          .child(`${m ? machineLabel(m) : "this computer"}${n ? ` (${n})` : ""}`)))));
  }

  // A machine in trouble that has no space to show it on.
  machineCard(t, m) {
    const strip = alertStrip(t, `m-${m.name}`, m.name, m.state);
    return card(t, `machine-${m.name}`, false, m.state)
      .on_click(() => run("app.settings", { section: "machines" }))
      .tooltip("Open Settings › Machines")
      .child(h_flex().px(11).py(8).gap(8).items_center()
        .child(chrome("server", 13).text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().font_medium().child(machineLabel(m.name)))
        .child(div().id(`dismiss-${m.name}`).flex_none().px(6).py(2).rounded(5).text_size(11.5).text_color(t.muted)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Hide until its state changes")
          .on_click((_e, cx) => {
            cx.stop_propagation();
            this.dismissed[m.name] = m.state;
            localStorage.setItem("dismissed", JSON.stringify(this.dismissed));
            cx.notify();
          })
          .child("Hide")))
      .child(strip);
  }

  card(t, s, i, colors) {
    const color = colors[s.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    const state = stateOf(s.machine);
    const strip = alertStrip(t, s.id, s.machine, state);
    const from = this.pressed === null ? -1 : spaces().findIndex((x) => x.id === this.pressed);
    return card(t, `space-${s.id}`, s.active, state)
      .relative()
      .when(this.pressed === s.id && this.over !== s.id, (el) => el.opacity(0.5))
      .on_mouse_down("left", () => { this.pressed = s.id; this.over = s.id; })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find((x) => x.id === this.pressed);
        const over = source && (source.machine ?? null) === (s.machine ?? null) ? s.id : null;
        if (this.pressed !== null && this.over !== over) { this.over = over; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        const pressed = this.pressed, over = this.over;
        this.pressed = null;
        this.over = null;
        if (pressed !== null && over === s.id && pressed !== s.id) {
          const index = spaces().findIndex((x) => x.id === s.id);
          if (index !== -1) run("space.move", { id: pressed, index: index + 1 });
        } else if (pressed === s.id) run("space.select", { id: s.id });
        cx.notify();
      })
      .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } }))
      .child(h_flex().px(11).py(9).gap(10).items_center().min_w(0)
        .child(h_flex().size(24).flex_none().rounded(7).bg(fill).items_center().justify_center()
          .text_size(11.5).font_bold().text_color("#ffffff").child([...s.name][0]?.toUpperCase() ?? "?"))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().gap(8).items_center().min_w(0)
            .child(div().flex_initial().min_w(0).truncate().font_medium().text_color(t.foreground).child(s.name))
            .child(div().id(`hide-${s.id}`).flex_none().rounded(5).px(3).mx(-3)
              .hover((h) => h.bg(t.raised)).tooltip(`Hide ${s.machine ? machineLabel(s.machine) : "this computer"}'s spaces and agents`)
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_click((_e, cx) => { cx.stop_propagation(); setHidden(s.machine, true); })
              .child(machineTag(t, s.machine)))
            .child(div().flex_1())
            .when(Boolean(s.status) && s.status !== "idle", (el) => el.child(mark(t, s.status, true))))
          .when(Boolean(s.branch), (el) => el.child(h_flex().gap(5).items_center().min_w(0).text_color(t.muted)
            .child(chrome("git-branch", 11))
            .child(div().flex_1().min_w(0).truncate().font_family(MONO).text_size(11.5).child(s.branch))))))
      .when(Boolean(strip), (el) => el.child(strip))
      // Where a dragged space would land.
      .when(this.pressed !== null && this.over === s.id && this.pressed !== s.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent).when(from < i, (l) => l.bottom(0)).when(from > i, (l) => l.top(0))));
  }
}
