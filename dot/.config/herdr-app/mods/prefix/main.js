// Ctrl+Space, then a key: the prefix bindings migrated from Herdr TUI's config.toml.
// Adapted from herdrdev/herdr-layout-examples/tmux-prefix.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, closeOverlay, focused, hc, nextCommand, props, run, theme } from "herdr";

// [key, label, command, args, repeatable]. Uppercase means with Shift.
const REPEAT_MS = 500;
const BINDINGS = [
  ["c", "New tab", "tab.new"],
  ["v", "Split right", "pane.split", { direction: "right" }],
  ["s", "Split down", "pane.split", { direction: "down" }],
  ["x", "Close pane", "pane.close"],
  ["X", "Close tab", "tab.close"],
  ["z", "Zoom pane", "pane.zoom"],
  ["n", "Next tab", "tab.next"],
  ["p", "Toggle sidebar", "layout.toggle", { id: "sidebar" }],
  ["w", "Go to space, tab or agent", "mod.open", { name: "picker" }],
  ["g", "Go to space, tab or agent", "mod.open", { name: "picker" }],
  ["N", "New space", "space.new"],
  ["W", "Rename space", "space.rename"],
  ["T", "Rename tab", "tab.rename"],
  ["D", "Close space", "space.close"],
  ["h", "Focus left", "pane.go", { direction: "left" }, true],
  ["j", "Focus down", "pane.go", { direction: "down" }, true],
  ["k", "Focus up", "pane.go", { direction: "up" }, true],
  ["l", "Focus right", "pane.go", { direction: "right" }, true],
  ["H", "Swap pane left", "pane.swap", { direction: "left" }, true],
  ["J", "Swap pane down", "pane.swap", { direction: "down" }, true],
  ["K", "Swap pane up", "pane.swap", { direction: "up" }, true],
  ["L", "Swap pane right", "pane.swap", { direction: "right" }, true],
  ["?", "Help", "app.help"],
];

// On Windows the app reports Shift+digit as the character it types, without the Shift
// modifier, so map those characters back to digits. This covers the Swiss French and
// German layouts installed here; a US layout would need !@#$%^&*( instead.
const SHIFT_DIGITS = { "+": 1, "!": 1, '"': 2, "*": 3, "§": 3, "ç": 4, "$": 4, "%": 5, "&": 6, "/": 7, "(": 8, ")": 9 };

export default class Prefix extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.repeat = false;
    this.generation = 0;
    // keys.json "mod:prefix" bindings arrive here; they beat the global ones while the popup is open.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        const agent = /agent-([1-9])$/.exec(command);
        if (agent) this.focusAgent(Number(agent[1]));
        else if (command.endsWith("send-prefix")) this.sendPrefix(cx);
      }
    });
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  focusAgent(n) {
    const agent = agents()[n - 1];
    this.dismiss();
    if (agent) run("agent.focus", { terminal: agent.address });
  }

  // Ctrl+Space twice sends a literal Ctrl+Space to the focused terminal.
  sendPrefix(cx) {
    this.generation++;
    const terminal = focused()?.terminal;
    if (!terminal) return this.dismiss();
    const pending = hc(["keys", terminal, "ctrl+space"]);
    cx.spawn(async () => {
      const result = await pending;
      if (result.code !== 0) console.log(`prefix: ${result.stderr}`);
    });
    this.dismiss();
  }

  key(e, cx) {
    cx.stop_propagation();
    const m = e.modifiers;
    if (e.key === "escape") return this.dismiss();
    if (m.control && e.key === "space") return this.sendPrefix(cx);
    if (m.control || m.platform) return this.dismiss();
    if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key);
      if (m.alt) return this.focusAgent(n);
      this.dismiss();
      run(m.shift ? "space.select" : "tab.select", { index: n });
      return;
    }
    if (m.alt) return this.dismiss();
    const key = e.key_char ?? (m.shift && e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const space = SHIFT_DIGITS[key] ?? SHIFT_DIGITS[e.key];
    if (space) {
      this.dismiss();
      run("space.select", { index: space });
      return;
    }
    const binding = BINDINGS.find((b) => b[0] === key);
    if (!binding) return this.dismiss();
    const [, , command, args = {}, repeatable = false] = binding;
    if (!repeatable) this.dismiss();
    run(command, args);
    if (repeatable) {
      this.repeat = true;
      const generation = ++this.generation;
      cx.timer.after(REPEAT_MS, () => {
        if (this.generation === generation) this.dismiss();
      });
      cx.notify();
    }
  }

  render() {
    const t = theme();
    return v_flex().id("prefix").track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .p(14).gap(8).bg(t.popover).text_color(t.foreground).text_size(12)
      .child(h_flex().justify_between().child(div().font_semibold().child(this.repeat ? `Repeat · ${REPEAT_MS} ms` : "Ctrl+Space · waiting for a key"))
        .child(div().text_color(t.muted).child("Esc cancel · Ctrl+Space again sends it")))
      .child(v_flex().h(320).min_h(0).overflow_y_scrollbar().children(BINDINGS.map(([key, label, , , repeatable]) =>
        h_flex().h(20).flex_none().items_center().gap(12).child(div().w(40).text_color(t.accent).child(key))
          .child(div().flex_1().child(label)).child(div().text_color(t.dim).child(repeatable ? "repeat" : "")))))
      .child(div().text_color(t.muted).child("1–9 tab · Shift+1–9 space · Alt+1–9 agent"));
  }
}
