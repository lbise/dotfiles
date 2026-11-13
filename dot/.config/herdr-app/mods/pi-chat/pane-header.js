// The header over each terminal pane. A Pi pane gets the chat's own header with
// the switch back to Chat; any other pane gets what Herdr's pane header shows.
// Both keep the pane's split, zoom and close buttons (on hover) and its status.

import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { nextCommand, panes, props, run, theme } from "herdr";
import { feedFor } from "./feeds.js";
import { followFocus } from "./follow.js";
import { headerButton, piHeader } from "./header.js";
import { viewSwitch } from "./switch.js";
import { icon, shortFolder } from "./ui.js";
import { chooseView, piPane, target } from "./view.js";

const FOLLOW_EVERY = 400;

export class PaneHeader {
  constructor(cx) {
    this.hovered = false;
    cx.timer.every(FOLLOW_EVERY, (cx) => followFocus(cx));
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        const pi = target();
        if (command === "toggle" && pi && pi.pane === props()?.pane) chooseView(pi, "chat");
      }
    });
  }

  status(t, status) {
    if (status === "working") return icon("spinner", 13).text_color(t.working).spin(900);
    if (status === "blocked") {
      return div().flex_none().h(20).px(7).flex().items_center().rounded(6).bg(`${t.blocked}26`).text_size(11).font_medium().text_color(t.blocked).child("Needs you");
    }
    if (status === "done") return div().size(7).flex_none().rounded(4).bg(t.done);
    return null;
  }

  buttons(t, pane) {
    if (!this.hovered) return [];
    const button = (name, glyph, label, command, args) =>
      headerButton(t, `pi-chat-${name}-${pane.pane}`, icon(glyph, 14), label, false, () => run(command, args));
    return [
      button("right", "split-right", "Split right", "pane.split", { direction: "right", pane: pane.pane }),
      button("down", "split-down", "Split down", "pane.split", { direction: "down", pane: pane.pane }),
      button("zoom", pane.zoomed ? "unzoom" : "zoom", pane.zoomed ? "Unzoom" : "Zoom", "pane.zoom", { pane: pane.pane }),
      button("close", "close", "Close", "pane.close", { pane: pane.pane }),
    ];
  }

  plain(t, pane, trailing) {
    const program = pane.program;
    const name = (program && (program.agent || program.shell) && program.name) || pane.title || (program && program.name) || "shell";
    const glyph = !program || !program.icon ? null : program.tint ? svg(program.icon).size(14).flex_none().text_color(t.dim) : image(program.icon).size(14).flex_none();
    return h_flex()
      .size_full()
      .px(14)
      .gap(10)
      .items_center()
      .bg(t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(13)
      .when(glyph, (el) => el.child(glyph))
      .child(div().flex_none().max_w(260).truncate().font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(shortFolder(pane.cwd)))
      .children(trailing);
  }

  render() {
    const t = theme();
    const pane = panes().find((entry) => entry.pane === props()?.pane);
    if (!pane) return div();
    const pi = piPane(pane);
    const status = this.status(t, pane.status);
    const trailing = [...(status ? [status] : []), ...this.buttons(t, pane)];
    const body = pi
      ? piHeader(t, pi, (feedFor(pi).chat.state || {}).title || "", [...trailing, viewSwitch(t, "terminal", (mode) => chooseView(pi, mode))])
      : this.plain(t, pane, trailing);
    return body
      .id(`pi-chat-pane-${pane.pane}`)
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane: pane.pane }));
  }
}
