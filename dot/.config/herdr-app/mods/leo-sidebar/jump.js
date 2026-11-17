// Alt+A (keys.json "layout:leo": mod.open:leo-sidebar): a small popup that
// takes the next key. While it is open the agent cards show their number; 1–9
// jumps to that card, Enter to the top one (the most urgent), anything else closes it.
// The cards' order comes from the agents block (shared ORDER), so it also works
// while the sidebar is hidden, just without the numbers in sight.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { closeOverlay, props, run, setShared, shared, theme } from "herdr";
import { MONO } from "./ui.js";

export const JUMP = "leo-sidebar.jump"; // when the popup opened (ms), null when closed
export const ORDER = "leo-sidebar.order"; // agent addresses as the cards show them

/** The popup is open. A crash that skipped close() stops counting after a minute. */
export const jumping = () => Date.now() - (shared(JUMP) ?? 0) < 60000;

export class JumpView {
  constructor(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    setShared(JUMP, Date.now());
  }

  close() {
    setShared(JUMP, null);
  }

  go(n) {
    const address = (shared(ORDER) ?? [])[n - 1];
    closeOverlay(props().overlay);
    if (address) run("agent.focus", { terminal: address });
  }

  key(e, cx) {
    cx.stop_propagation();
    if (/^[1-9]$/.test(e.key) && !e.modifiers.control && !e.modifiers.alt) return this.go(Number(e.key));
    if (e.key === "enter") return this.go(1);
    closeOverlay(props().overlay);
  }

  render() {
    const t = theme();
    const count = Math.min((shared(ORDER) ?? []).length, 9);
    return h_flex().id("jump").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().px(12).gap(10).items_center().bg(t.popover).text_size(12.5)
      .child(div().font_medium().text_color(t.foreground).child("Jump to agent"))
      .child(div().flex_1().min_w(0).truncate().font_family(MONO).text_size(11.5).text_color(t.muted)
        .child(count ? `1–${count} · Enter top · Esc` : "No agents"));
  }
}
