// Leo's sidebar: agents and spaces as cards, no machine groups (layouts/leo.json; the old lists are layouts/leo-classic.json).
// One mod, two blocks: props.view "agents" (agents.js) or "spaces" (spaces.js),
// and the Alt+A popup (jump.js) when opened as an overlay.
// live.js reads the machines and each Pi's state for both.

import { View } from "gpui-kit";
import { nextCommand, props } from "herdr";
import { AgentsView } from "./agents.js";
import { JumpView } from "./jump.js";
import { SpacesView } from "./spaces.js";
import { poll } from "./live.js";

export default class Sidebar extends View {
  init(_props, cx) {
    if (props()?.overlay) {
      this.part = new JumpView(cx);
      return;
    }
    this.part = props()?.view === "spaces" ? new SpacesView() : new AgentsView();
    // keys.json bindings "leo-sidebar.<command>"; each part takes its own.
    cx.spawn(async (cx) => {
      for (;;) {
        this.part.command?.(await nextCommand());
        cx.notify();
      }
    });
    let tick = 0;
    cx.timer.every(1000, (cx) => {
      tick++;
      cx.spawn(async (cx) => { if (await poll()) cx.notify(); });
      // Clocks: every second while one runs, else the "6m ago" figures twice a minute.
      if (this.part.ticking?.() || tick % 30 === 0) cx.notify();
    });
  }

  close() {
    this.part.close?.();
  }

  render(cx) {
    return this.part.render(cx);
  }
}
