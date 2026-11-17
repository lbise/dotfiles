// The reply box: the text (one to eight lines), the model and thinking pickers
// under it, and the round button that sends, or stops a working Pi. Over it opens
// the slash menu, or a picker the view hands in. Files pasted, dropped on it or
// picked with + wait over the text as chips (attach.js) and go with the message.

import { div, image } from "gpui-kit";
import { Popup, Textarea, TextareaState, h_flex, v_flex } from "gpui-base";
import { stageFiles } from "./attach.js";
import { completePath, pathWord, sessionCommand } from "./model/lists.js";
import { selectAll, takeKeys } from "./keys.js";
import { menu } from "./menu.js";
import { SlashMenu } from "./slash.js";
import { icon, mix } from "./ui.js";

const TWICE = 250; // a press that closes a menu also lands on its chip
const QUIT = 500; // Pi's window for the second Ctrl+C

export class Composer {
  /**
   * @param {object} chat The view: `send(text, files, cx)`, `say(notice, cx)`, `stop(cx)`, `command(command, cx)`,
   *   `runSession(action, instructions, cx)`, `listPaths(prefix)`, `slashCommands()`, `loadCommands(cx)`, `busy()`, `openModels(cx)`, `editDraft(cx)`.
   */
  constructor(chat) {
    this.chat = chat;
    this.slash = new SlashMenu();
    this.input = TextareaState.new({ placeholder: "Reply to Pi", rows: 1 });
    this.input.set_soft_wrap(true);
    this.input.set_auto_grow(1, 8);
    this.blank = true;
    this.open = null; // the open menu: "model" or "thinking"
    this.closedAt = 0;
    this.hint = ""; // the paths a Tab could not choose between
    this.files = []; // attached, staged on this computer: { rel, name, image }
    this.clearedAt = 0; // the last Ctrl+C that emptied the box
    // A paste with no text: a picture or files copied in Explorer.
    this.input.on("paste_other", (_event, cx) => this.attach("paste", [], cx));
    // Enter that reached the box's own binding instead of ours (keys.js): it has
    // broken the line already. Shift+Enter keeps the break; Enter takes it back and sends.
    this.input.on("submit", (event, cx) => {
      if (event.shift || event.secondary) return;
      const text = this.input.value();
      const at = this.input.selected_range().start;
      const br = text.lastIndexOf("\n", at - 1);
      if (br >= 0 && !text.slice(br, at).trim()) this.input.set_value(text.slice(0, br) + text.slice(at));
      this.enter(cx);
    });
    // The button's look and the slash menu depend on the text: redraw when either changes.
    this.input.on("change", (_event, cx) => {
      const text = this.input.value();
      const query = this.slash.query;
      if (this.hint) {
        this.hint = "";
        cx.notify();
      }
      if (this.slash.follow(text)) this.chat.loadCommands(cx);
      const blank = !text.trim();
      if (blank === this.blank && query === this.slash.query) return;
      this.blank = blank;
      cx.notify();
    });
  }

  text() {
    return this.input.value();
  }

  /** Puts `text` in the box, the caret after it. */
  set(text) {
    // set_value leaves the caret at the start; typing it in leaves it at the end.
    this.input.set_value("");
    if (text) this.input.replace(text);
    this.blank = !text.trim();
    this.slash.follow(text);
  }

  focus() {
    this.input.focus();
  }

  enter(cx) {
    const items = this.slash.items(this.chat.slashCommands());
    if (items.length) return this.accept(items[Math.min(this.slash.index, items.length - 1)], cx);
    const text = this.input.value().trim();
    const files = this.files;
    if (!text && !files.length) return;
    const session = files.length ? null : sessionCommand(text);
    if (session) {
      if (this.chat.runSession(session.action, session.instructions, cx)) this.set("");
      return;
    }
    this.set("");
    this.files = [];
    this.chat.send(text, files, cx);
  }

  /** Adds files to the message: from the clipboard, a file dialog, or dropped paths. */
  attach(how, paths, cx) {
    cx.spawn(async (cx) => {
      try {
        this.files = [...this.files, ...(await stageFiles(how, paths))];
      } catch (err) {
        this.chat.say(`Could not attach: ${err instanceof Error ? err.message : err}`, cx);
      }
      cx.notify();
    });
  }

  detach(rel, cx) {
    this.files = this.files.filter((file) => file.rel !== rel);
    cx.notify();
  }

  chips(t) {
    return h_flex()
      .pb(8)
      .gap(6)
      .flex_wrap()
      .children(
        this.files.map((file, index) =>
          h_flex()
            .id(`pi-chat-file-${index}`)
            .h(40)
            .max_w(220)
            .pl(file.image ? 4 : 10)
            .pr(4)
            .gap(6)
            .items_center()
            .rounded(8)
            .bg(t.raised)
            .text_size(12.5)
            .text_color(t.muted)
            .tooltip(file.name)
            .child(file.image ? image(file.rel).size(32).rounded(5).flex_none() : icon("file", 14))
            .child(div().truncate().child(file.name))
            .child(
              div()
                .id(`pi-chat-file-${index}-remove`)
                .size(20)
                .flex_none()
                .flex()
                .items_center()
                .justify_center()
                .rounded(5)
                .cursor_pointer()
                .hover((s) => s.bg(t.surface).text_color(t.foreground))
                .accessibility_label(`Remove ${file.name}`)
                .on_click((_event, cx) => this.detach(file.rel, cx))
                .child(icon("close", 12)),
            ),
        ),
      );
  }

  plus(t) {
    return div()
      .id("pi-chat-attach")
      .size(24)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(7)
      .cursor_pointer()
      .text_color(t.muted)
      .hover((s) => s.bg(t.raised).text_color(t.foreground))
      .tooltip("Attach files (or paste, or drop them here)")
      .accessibility_label("Attach files")
      .on_click((_event, cx) => this.attach("pick", [], cx))
      .child(icon("plus", 15));
  }

  // Tab: the path at the end of the text, completed from the files on Pi's machine.
  complete(cx) {
    const text = this.input.value();
    if (!pathWord(text)) return;
    cx.spawn(async (cx) => {
      const found = await this.chat.listPaths(pathWord(text).word);
      if (this.input.value() !== text) return;
      const next = completePath(text, found);
      if (next !== text) this.set(next);
      this.hint = next === text && found.length > 1 ? found.slice(0, 20).map((path) => path.replace(/.*\/(?=.)/, "")).join("   ") : "";
      cx.notify();
    });
  }

  // A slash menu entry: a session command runs (or opens its picker), anything else goes in the box.
  accept(item, cx) {
    if (item.kind !== "session") this.set(`/${item.name} `);
    else if (this.chat.runSession(item.name, "", cx)) this.set("");
    cx.notify();
  }

  // Enter, and Pi's model and thinking keys, from the reply box (keys.js hands them over).
  fieldKey(key, cx) {
    if (key === "ctrl-a") selectAll(this.input, cx);
    else if (key === "ctrl-g") this.chat.editDraft(cx);
    else if (key === "ctrl-c") this.ctrlC(cx);
    else if (key === "enter") this.enter(cx);
    else if (key === "tab") this.complete(cx);
    else if (key === "shift-tab") this.chat.command({ type: "cycle", what: "thinking" }, cx);
    else this.chat.command({ type: "cycle", what: "model", direction: key === "alt-p" ? "backward" : "forward" }, cx);
  }

  // As Pi: the first empties the box, a second soon after quits Pi.
  ctrlC(cx) {
    if (Date.now() - this.clearedAt < QUIT) {
      this.clearedAt = 0;
      return this.chat.command({ type: "quit" }, cx);
    }
    this.clearedAt = Date.now();
    this.set("");
    this.files = [];
    this.hint = "";
    cx.notify();
  }

  // ↑↓ Tab Enter Esc while the slash menu is open (keys.js hands them over).
  slashKey(key, cx) {
    if (key === "ctrl-a") return selectAll(this.input, cx);
    const items = this.slash.items(this.chat.slashCommands());
    if (key === "up" || key === "down") this.slash.move(key === "up" ? -1 : 1, items.length);
    else if (key === "escape") this.slash.dismiss(this.input.value());
    else if (items.length) this.accept(items[Math.min(this.slash.index, items.length - 1)], cx);
    cx.notify();
  }

  // That press must not open the menu again.
  toggle(name, cx) {
    const reopens = this.open === null && Date.now() - this.closedAt < TWICE;
    this.open = this.open === name || reopens ? null : name;
    cx.notify();
  }

  close(cx) {
    if (this.open === null) return;
    this.open = null;
    this.closedAt = Date.now();
    cx.notify();
  }

  chip(t, name, text, strong) {
    return h_flex()
      .id(`pi-chat-${name}`)
      .h(24)
      .px(8)
      .flex_none()
      .items_center()
      .rounded(7)
      .cursor_pointer()
      .text_size(12.5)
      .text_color(strong ? t.foreground : t.muted)
      .when(this.open === name, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.raised).text_color(t.foreground))
      .on_click((_event, cx) => this.toggle(name, cx))
      .child(text);
  }

  pickers(t, state) {
    const parts = [];
    const model = state.model;
    if (model) {
      const models = Array.isArray(state.models) ? state.models : [];
      const same = (other) => other.provider === model.provider && other.id === model.id;
      parts.push(
        menu(t, {
          id: "pi-chat-models",
          trigger: this.chip(
            t,
            "model",
            h_flex()
              .gap(6)
              .child(model.name || model.id)
              .when(model.provider, (el) => el.child(div().font_normal().text_color(t.muted).child(model.provider))),
            true,
          ),
          open: this.open === "model",
          width: 340,
          items: [
            ...models.map((entry, index) => ({ key: String(index), text: entry.name || entry.id, note: entry.provider, on: same(entry) })),
            { key: "all", text: "All models…", glyph: "sliders" },
          ],
          pick: (key, cx) => {
            this.close(cx);
            if (key === "all") return this.chat.openModels(cx);
            const picked = models[Number(key)];
            if (!same(picked)) this.chat.command({ type: "model", provider: picked.provider, id: picked.id }, cx);
          },
          close: (cx) => this.close(cx),
        }),
      );
    }
    if (state.thinking) {
      const levels = Array.isArray(state.thinkingLevels) ? state.thinkingLevels : [];
      parts.push(
        menu(t, {
          id: "pi-chat-thinking",
          trigger: this.chip(t, "thinking", state.thinking, false),
          open: this.open === "thinking",
          width: 150,
          items: levels.map((level) => ({ key: level, text: level, on: level === state.thinking })),
          pick: (level, cx) => {
            this.close(cx);
            if (level !== state.thinking) this.chat.command({ type: "thinking", level }, cx);
          },
          close: (cx) => this.close(cx),
        }),
      );
    }
    return parts;
  }

  // Nothing to send: no text, no file.
  empty() {
    return this.blank && !this.files.length;
  }

  // Send, or Stop while Pi works. Text typed while it works is a steer: Pi reads
  // it once its running step ends, so both buttons show.
  buttons(t, working) {
    if (!working || this.empty()) return [this.button(t, working ? "stop" : "send")];
    return [this.button(t, "steer"), this.button(t, "stop")];
  }

  button(t, kind) {
    const working = kind === "stop";
    const ready = working || !this.empty();
    const label = { send: "Send", steer: "Steer", stop: "Stop" }[kind];
    const tip = { send: "Send (Enter)", steer: "Steer: Pi reads it once its running step ends (Enter)", stop: "Stop (Esc)" }[kind];
    return div()
      .id(`pi-chat-${kind}`)
      .size(28)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(14)
      // Beside Steer, Stop steps back.
      .bg(ready && !(working && !this.empty()) ? t.accent : t.raised)
      .text_color(!ready ? t.dim : working && !this.empty() ? t.foreground : t.accent_foreground)
      .tooltip(tip)
      .accessibility_label(label)
      .when(ready, (el) =>
        el
          .cursor_pointer()
          .hover((s) => s.opacity(0.86))
          .on_click((_event, cx) => (working ? this.chat.stop(cx) : this.enter(cx))),
      )
      .child(icon(working ? "stop" : "arrow-up", 16));
  }

  /**
   * @param {Record<string, string>} t The theme.
   * @param {object} state The feed's state.json.
   * @param {{ picker: import("gpui-kit").Element|null, width: number }} above A picker to show over the box, and the width a popover may take.
   */
  render(t, state, above) {
    const working = state.status === "working";
    const slash = above.picker
      ? null
      : this.slash.render(t, this.slash.items(this.chat.slashCommands()), {
          width: Math.min(560, above.width),
          busy: this.chat.busy(),
          accept: (item, cx) => this.accept(item, cx),
          hover: (index, cx) => {
            this.slash.index = index;
            cx.notify();
          },
        });
    const over = above.picker || slash;
    const box = v_flex()
      .id("pi-chat-reply")
      .w_full()
      .pt(12)
      .pb(10)
      .pl(14)
      .pr(12)
      .rounded(14)
      .bg(t.surface)
      .border_1()
      .border_color(mix(t.border, t.accent, 0.45))
      .on_key_down((event, cx) => {
        if (event.key !== "escape" || !working) return;
        cx.stop_propagation();
        this.chat.stop(cx);
      })
      .on_drop((event, cx) => this.attach("drop", event.paths, cx))
      .when(this.files.length, (el) => el.child(this.chips(t)))
      .when(this.hint, (el) => el.child(div().pb(6).truncate().font_family("Geist Mono").text_size(12).text_color(t.muted).child(this.hint)))
      .child(takeKeys(div().w_full(), slash !== null, (key, cx) => (slash ? this.slashKey(key, cx) : this.fieldKey(key, cx))).child(Textarea.new(this.input).w_full().text_size(15).text_color(t.foreground)))
      .child(h_flex().mt(8).gap(2).items_center().child(this.plus(t)).children(this.pickers(t, state)).child(div().flex_1()).child(h_flex().gap(6).children(this.buttons(t, working))));
    // The popovers hang from a line along the box's top edge.
    const anchor = Popup.new("pi-chat-over-reply", div().w_full().h(0)).anchor("bottom_left").when(over, (el) => el.content(div().pb(8).child(over)));
    return v_flex().w_full().mt(14).mb(12).child(anchor).child(box);
  }
}
