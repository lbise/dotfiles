// The agents as cards, most urgent first: Needs you, Done, Idle (free for work),
// then Working. Every card is the same base (program icon with its status, name
// and machine, branch); Needs you adds Pi's question, Done its last turn.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, panes, run, setAgentOrder, setShared, shared, spaces, theme } from "herdr";
import { SECTION, agentName, ago, current, ordered, span } from "./data.js";
import { ORDER, jumping } from "./jump.js";
import { hiddenMachines, machineOf, piStale, piState, stateOf } from "./live.js";
import { MONO, agentTile, alertStrip, card, cells, machineTag } from "./ui.js";

export class AgentsView {
  constructor() {
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
  }

  // Stamps agents whose state changed, and asks for a fresh read of their Pi.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      if (this.changed[a.address]?.s === a.status) continue;
      // Looking at a done agent makes it idle: that's no news, keep the time it finished.
      const looked = this.changed[a.address]?.s === "done" && a.status === "idle";
      this.changed[a.address] = { s: a.status, at: looked ? this.changed[a.address].at : now };
      piStale(a.address);
      dirty = true;
    }
    if (!dirty) return;
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  /** Any card shows a running clock. */
  ticking() {
    return agents().some((a) => a.status === "working");
  }

  render() {
    const t = theme();
    const now = Date.now();
    const hidden = hiddenMachines();
    const list = agents().filter((a) => !hidden.has(machineOf(a.address) ?? ""));
    this.track(list, now);
    const named = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tab.named]));
    const branches = new Map(panes().map((p) => [p.pane, p.branch]));
    const rows = ordered(list, (a) => this.since(a));
    const order = rows.map((a) => a.address);
    setAgentOrder(order);
    // For the Alt+A popup, another copy; written only when it changed (setShared re-renders every mod).
    if (JSON.stringify(order) !== JSON.stringify(shared(ORDER) ?? [])) setShared(ORDER, order);
    const numbered = jumping();

    const items = [];
    for (const [i, a] of rows.entries()) {
      if (a.status !== rows[i - 1]?.status) {
        const count = rows.filter((r) => r.status === a.status).length;
        items.push(h_flex().id(`sec-${a.status}`).flex_none().pt(i ? 10 : 2).pb(1).px(2).gap(7).items_center().text_size(12).font_medium()
          .text_color(a.status === "blocked" ? t.blocked : t.muted)
          .child(SECTION[a.status] ?? a.status)
          .child(div().font_family(MONO).text_size(11).text_color(t.dim).child(String(count))));
      }
      items.push(this.card(t, a, now, named, branches, numbered && i < 9 ? i + 1 : null));
    }

    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).flex_none().pl(16).pr(10).items_center().text_size(11.5).text_color(t.dim).child("Agents"))
      .when(!rows.length, (el) => el.child(div().px(16).text_size(12).text_color(t.dim).child("No agents yet. They show here once they report their status.")))
      .child(v_flex().id("lsb-agents").flex_1().min_h(0).px(10).pb(10).gap(6).overflow_y_scrollbar().children(items));
  }

  card(t, a, now, named, branches, number) {
    const pi = a.app === "pi" ? piState(a.address, a.status) : null;
    const st = pi?.state;
    const turn = st?.turn;
    const name = agentName(a, st?.title, named.get(a.tab));
    const machine = machineOf(a.address);
    const machineState = stateOf(machine);
    const branch = branches.get(a.pane) ?? st?.git?.branch;
    const since = this.since(a);
    const working = a.status === "working";
    const running = working && turn && turn.endedAt == null;
    const muted = (size) => div().font_family(MONO).text_size(size).text_color(t.muted);

    // Every card: name and machine, the branch under them (a working agent's
    // cells and clock at its end). Needs you and Done add a line below.
    const lines = v_flex().flex_1().min_w(0).gap(1)
      .child(h_flex().gap(8).items_center().min_w(0)
        .child(div().flex_1().min_w(0).truncate().font_medium().text_color(t.foreground).child(name))
        .child(machineTag(t, machine)))
      .child(h_flex().gap(8).items_center().min_w(0)
        .child(muted(11).flex_1().min_w(0).truncate().child(branch ?? ""))
        .when(working && Boolean(turn?.steps?.length), (el) => el.child(cells(t, turn.steps, 8)))
        // Its Pi turn's clock, else since it started working.
        .when(working && Boolean(running || since), (el) => el.child(muted(11.5).flex_none().child(running ? span(now - turn.startedAt) : ago(now - since)))));
    const body = v_flex().px(10).py(6).gap(6).min_w(0)
      .child(h_flex().gap(10).items_center().min_w(0).child(agentTile(t, a.program, a.status, 26, number)).child(lines));

    // The added line sits under the text, past the tile.
    const extra = (el) => body.pb(9).child(el.pl(36).min_w(0));
    if (a.status === "blocked" && st?.ask?.question) {
      extra(div().max_h(57).overflow_hidden().text_size(13).line_height(1.45).text_color(t.foreground).child(st.ask.question.trim()));
    }
    if (a.status === "done" && turn?.endedAt) {
      extra(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.muted).child(`Worked ${span(turn.endedAt - turn.startedAt)}`))
        // The step count is in the tooltip; the cells say enough on the card.
        .child(div().id(`steps-${a.address}`).tooltip(`${turn.steps.length} step${turn.steps.length === 1 ? "" : "s"}`).child(cells(t, turn.steps, 12))));
    }

    const strip = alertStrip(t, a.address, machine, machineState);
    const alerting = machineState && machineState !== "ok"; // the machine's edge wins
    return card(t, `ag-${a.address}`, a.focused, machineState)
      // Needs you: the card itself stands out, in the blocked colour.
      .when(a.status === "blocked" && !alerting, (el) => el.border_color(t.blocked).when(!a.focused, (el) => el.bg(t.blocked + "1f")))
      .on_click(() => run("pane.focus", { pane: a.pane }))
      // What a working Pi is doing right now shows on hover.
      .when(Boolean(current(turn)) && working, (el) => el.tooltip(`${current(turn).verb} ${current(turn).label}`))
      .child(body)
      .when(Boolean(strip), (el) => el.child(strip));
  }
}
