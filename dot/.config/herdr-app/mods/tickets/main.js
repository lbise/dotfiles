// Tickets: the tickets assigned to me (closed statuses start filtered out), from one source of sources.json at a time
// (Redmine at work, GitHub issues at home; providers.js knows each kind). A source
// runs its commands on its machine; one whose machine this window does not know is
// left out. With several left, a switch picks one; the pick and the status chips
// flipped from their default are kept per computer (shared "tickets.source", "tickets.off"). Everything the
// provider's form lists can be changed: lists in dropdowns (filtered by typing when
// long), the rest in place. Redmine tickets also have attachments (opened in the
// browser, saved to ~/Downloads on the source's machine, added by path or by dropping
// files), relations and watchers. The tickets show as a list or as a board with a
// column per status they are in ("tickets.view"); dragging a card to another column
// changes its status when the tracker's workflow allows it. Unsent comments and descriptions survive switching
// tickets and closing the app ("tickets.drafts"). A side panel (layouts/leo.json's
// `tickets` block), opened from the Tickets button in the tab bar or
// leo-tabs.tickets, maximized with leo-tabs.max (mods/leo-tabs). Below WIDE it is
// the list, or the picked ticket with a way back; the board needs the room. Keyboard: see HELP.
// shortcut: the status chips, attachments, relations and watchers are mouse only, and the
// ticket's text scrolls with the wheel only; give them keys if they get used often.

import { View, div, image, svg } from "gpui-kit";
import { Input, InputState, Popup, ScrollHandle, Textarea, TextareaState, TextView, h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, layout, machines, nextCommand, notify, readTextFile, run as runCommand, setShared, settings, shared, theme, writeTextFile } from "herdr";
import { PROVIDERS, RELATIONS, ago, columns, dropped, inlineImages, parseSources, size, valueOf } from "./providers.js";

const MONO = "Geist Mono";
const lit = (off, key) => off.has(key) === key.startsWith("cl:"); // a closed status's chip starts off
const TIMEOUT_MS = 60000;
const SOURCE = "tickets.source";
const OFF = "tickets.off"; // status chips flipped from their default: "st:<open status>" turned off, "cl:<closed status>" turned on
const VIEW = "tickets.view"; // "list" or "board"
const DRAFTS = "tickets.drafts"; // ticket key -> { comment?, description? }
const IMAGES = "tickets.images"; // cached image (app-home path) -> [width, height]
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TWICE = 250; // a press that closes a dropdown also lands on its trigger
const FILTER_FROM = 10; // a dropdown this long gets a filter field
const SHOWN = 200; // a dropdown draws at most this many; typing narrows the rest
const DOWNLOADS = "~/Downloads"; // where Save puts an attachment, on the source's machine
// Trackers keep a single line break; markdown would join the lines. Two spaces keep it.
const SOFT_BREAK = /([^\n])\n(?=[^\n])/g;
const WIDE = 760; // design px from which the list and the ticket sit side by side
const HELP = ["j/k ticket", "enter/o open", "esc back", "v list/board", "s source", "r refresh", "m maximize", "q close",
  "on a ticket: t title", "S status", "e description", "c comment", "ctrl-enter save/send", "w watch", "y copy link", "b browser",
  "in a list: j/k ↑↓ enter", "? keys"];

export default class Tickets extends View {
  init(_props, cx) {
    this.width = 0; // design px
    this.narrow = true;
    this.handle = cx.focus_handle();
    this.listScroll = ScrollHandle.new();
    this.cursor = ""; // the ticket the keyboard is on
    this.menuAt = 0; // the open dropdown's option the keyboard is on
    this.help = false;
    this.shownKeys = []; // the tickets listed, as last drawn
    // "focus": leo-tabs showed the panel, or pane.go moved here (mod.json "focusable").
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) === "focus") this.handle.focus();
        cx.notify();
      }
    });
    this.sources = [];
    this.error = "";
    this.scripts = {}; // provider script file -> its text
    this.results = {}; // source name -> { state: "loading" | "ok" | "error", value: tickets, error }
    this.details = {}; // ticket key -> { state, value: detail, error }
    this.options = {}; // "<source>:<scope>:<attr>" -> { state, value: [{ id, name }], error }
    this.picked = "";
    this.editing = null; // on the picked ticket: the attr being typed, or "description"
    this.menu = null; // the open dropdown's attr
    this.closedAt = 0;
    this.saving = ""; // the attr (or "comment") on its way
    this.failed = ""; // why the last change did not go through
    this.copied = "";
    this.drag = null; // the key of the card being dragged
    this.moving = ""; // the key of the card whose status is changing
    this.confirm = ""; // the remove button waiting for its second press: "att:<id>", "rel:<id>", "watch:<id>"
    this.downloads = {}; // attachment id -> { state, value: path, error }
    this.images = {}; // "<source>:<attachment id>" -> { state, value: { path, width, height }, error }: images in the text
    this.textWidth = 0; // design px of the description, which images shrink to
    this.attaching = false;
    this.attachPath = InputState.new({ placeholder: "Path on the machine, e.g. ~/logs/run.txt" });
    this.attachPath.on("submit", (_e, cx) => this.attachTyped(cx));
    this.attachNote = InputState.new({ placeholder: "Description (optional)" });
    this.attachNote.on("submit", (_e, cx) => this.attachTyped(cx));
    this.relType = "relates";
    this.relTo = InputState.new({ placeholder: "#1234" });
    this.relTo.on("submit", (_e, cx) => this.relate(cx));
    this.relDelay = InputState.new({ placeholder: "days" });
    this.relDelay.on("submit", (_e, cx) => this.relate(cx));
    this.drafts = { ...(/** @type {object} */ (shared(DRAFTS)) || {}) };
    this.comment = TextareaState.new({ placeholder: "Add a comment (Markdown)", rows: 3 });
    this.comment.set_auto_grow(3, 12);
    this.comment.on("change", (_e, cx) => cx.notify());
    this.description = TextareaState.new({ rows: 12 });
    this.description.set_auto_grow(6, 30);
    this.line = InputState.new();
    this.line.on("submit", (_e, cx) => this.saveEdit(cx));
    this.lines = TextareaState.new({ rows: 3 });
    this.lines.set_auto_grow(2, 10);
    this.search = InputState.new({ placeholder: "Filter…" });
    this.search.on("change", (_e, cx) => { this.menuAt = 0; cx.notify(); });
    this.search.on("submit", (_e, cx) => {
      const item = this.menuItems()[this.menuAt];
      if (item) this.pickOption(item, cx);
    });
    if (checking()) return;
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/mods/tickets`;
      const text = await readTextFile(`${dir}/sources.json`);
      ({ sources: this.sources, error: this.error } = text === null ? { sources: [], error: "sources.json not found" } : parseSources(text));
      for (const kind of new Set(this.sources.map((s) => s.kind))) {
        const file = PROVIDERS[kind].script;
        if (file) this.scripts[file] = await readTextFile(`${dir}/${file}`);
      }
      this.refresh(cx);
    });
  }

  async close() {
    this.stash();
    setShared(DRAFTS, this.drafts);
  }

  /** The sources this window can run: here, or on a machine it knows. */
  shown() {
    const known = new Set(machines().map((m) => m.name));
    return this.sources.filter((s) => s.machine === null || known.has(s.machine));
  }

  current() {
    const shown = this.shown();
    return shown.find((s) => s.name === shared(SOURCE)) || shown[0];
  }

  off() {
    return new Set(/** @type {string[]} */ (shared(OFF) || []));
  }

  refresh(cx) {
    this.details = {};
    this.options = {};
    const source = this.current();
    if (source) this.load(source, cx);
    cx.notify();
  }

  /** Reads the source's list; the old one stays shown until the new one is in. */
  load(source, cx) {
    const provider = PROVIDERS[source.kind];
    this.results[source.name] = { ...this.results[source.name], state: "loading", value: this.results[source.name]?.value || [] };
    cx.spawn(async (cx) => {
      const result = await run(source, provider.list(this.scripts[provider.script]), (out) => provider.parseList(out, source.name));
      this.results[source.name] = { value: this.results[source.name].value, ...result };
      cx.notify();
    });
  }

  loadDetail(ticket, cx) {
    this.details[ticket.key] = { ...this.details[ticket.key], state: "loading" };
    cx.spawn(async (cx) => {
      await this.fetchDetail(ticket);
      cx.notify();
    });
  }

  /** Reads the ticket; a failed reload keeps what was shown, with the error over it. */
  async fetchDetail(ticket) {
    const source = this.sourceOf(ticket);
    const provider = PROVIDERS[source.kind];
    const result = await run(source, provider.view(ticket, this.scripts[provider.script]), provider.parseView);
    this.details[ticket.key] = result.state === "error" && this.details[ticket.key]?.value ? { ...this.details[ticket.key], state: "ok", error: result.error } : result;
    return this.details[ticket.key];
  }

  sourceOf(ticket) {
    return this.sources.find((s) => s.name === ticket.source);
  }

  choose(name, cx) {
    setShared(SOURCE, name);
    const source = this.current();
    if (!this.results[source.name]) this.load(source, cx);
    cx.notify();
  }

  /** Keeps the picked ticket's unsent comment and description. */
  stash() {
    if (!this.picked) return;
    const draft = { ...this.drafts[this.picked], comment: this.comment.value() };
    if (this.editing === "description") draft.description = this.description.value();
    if (!draft.comment) delete draft.comment;
    if (Object.keys(draft).length) this.drafts[this.picked] = draft;
    else delete this.drafts[this.picked];
  }

  pick(ticket, cx) {
    if (ticket.key !== this.picked) {
      this.stash();
      this.picked = ticket.key;
      this.comment.set_value(this.drafts[ticket.key]?.comment || "");
      this.editing = null;
      this.menu = null;
      this.failed = "";
      this.confirm = "";
      this.attaching = false;
    }
    const d = this.details[ticket.key];
    if (!d || (d.state === "error" && !d.value)) this.loadDetail(ticket, cx);
    cx.notify();
  }

  // Ctrl-click passes the chip's row: only this one stays on, or all again if it already was.
  flip(key, cx, row) {
    const off = this.off();
    const turn = (k, on) => (on === k.startsWith("cl:") ? off.add(k) : off.delete(k));
    const solo = row && row.every((k) => (k === key) === lit(off, k));
    if (row) for (const k of row) turn(k, solo || k === key);
    else turn(key, !lit(off, key));
    setShared(OFF, [...off]);
    cx.notify();
  }

  copy(ticket, cx) {
    cx.write_to_clipboard(ticket.url);
    this.copied = ticket.key;
    cx.timer.after(1500, (cx) => { this.copied = ""; cx.notify(); });
    cx.notify();
  }

  // Attachments, relations, watchers --------------------------------------

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

  attachTyped(cx) {
    const path = this.attachPath.value().trim();
    if (!path) {
      this.failed = "Type the file's path on the machine";
      return cx.notify();
    }
    this.apply({ attach: [path], description: this.attachNote.value().trim() }, cx);
  }

  drop(paths, cx) {
    const source = this.current();
    const seen = paths.map((p) => dropped(p, source.machine));
    if (seen.includes(null)) {
      this.failed = `${source.machine} cannot read files dropped here: type their path on it instead`;
      return cx.notify();
    }
    this.apply({ attach: seen, description: "" }, cx);
  }

  save(attachment, cx) {
    const source = this.current();
    const provider = PROVIDERS[source.kind];
    this.downloads[attachment.id] = { state: "loading" };
    cx.spawn(async (cx) => {
      const result = await run(source, provider.download(attachment, DOWNLOADS, this.scripts[provider.script]), (out) => out.trim());
      this.downloads[attachment.id] = result;
      if (result.state === "ok") notify({ title: "Attachment saved", body: `${result.value} on ${source.machine || "this computer"}`, level: "info" });
      cx.notify();
    });
    cx.notify();
  }

  relate(cx) {
    const to = valueOf({ label: "Issue", type: "id", nullable: false }, this.relTo.value());
    const delayText = this.relDelay.value().trim();
    const timed = this.relType === "precedes" || this.relType === "follows";
    if (to.error || (timed && delayText && !/^-?\d+$/.test(delayText))) {
      this.failed = to.error || "The delay is a whole number of days";
      return cx.notify();
    }
    this.apply({ relate: this.relType, to: to.value, ...(timed && delayText && { delay: Number(delayText) }) }, cx);
  }

  /**
   * An image attachment where the text puts it. Markdown cannot draw it and image() reads only
   * files under the app's folder, which a mod writes only as text: the provider sends it as an SVG
   * holding the image, kept in cache/tickets/ (an attachment never changes).
   */
  // shortcut: the cache is never pruned; if it grows too big, delete cache/tickets/ in the app's folder
  // and the shared "tickets.images" (else the images it lists show empty).
  picture(t, x, a, cx) {
    const key = `${x.source}:${a.id}`;
    const got = this.images[key];
    if (!got) {
      this.images[key] = { state: "loading" };
      cx.spawn(async (cx) => {
        this.images[key] = await this.fetchImage(this.sourceOf(x), a, key);
        cx.notify();
      });
    }
    if (got?.state !== "ok") {
      return div().text_size(12).text_color(got?.state === "error" ? t.ansi1 : t.dim).child(got?.state === "error" ? `${a.name}: ${got.error}` : `Loading ${a.name}…`);
    }
    const { path, width, height } = got.value;
    const scale = Math.min(1, (this.textWidth || width) / width);
    return div().id(`img-${key}`).flex_none().cursor_pointer().on_click((_e, cx) => cx.open_url(a.url))
      .child(image(path).w(width * scale).h(height * scale));
  }

  async fetchImage(source, a, key) {
    const provider = PROVIDERS[source.kind];
    const path = `cache/tickets/${key.replace(/[^\w-]/g, "_")}.svg`;
    const sizes = /** @type {Record<string, number[]>} */ (shared(IMAGES) || {});
    if (sizes[path]) return { state: "ok", value: { path, width: sizes[path][0], height: sizes[path][1] } };
    const result = await run(source, provider.image(a, this.scripts[provider.script]), (out) => {
      const [, width, height] = /^<svg [^>]*?width="(\d+)" height="(\d+)"/.exec(out) || [];
      if (!+width || !+height) throw new Error("not an image");
      return { svg: out, width: +width, height: +height };
    });
    if (result.state === "error") return result;
    const { svg: text, width, height } = result.value;
    const file = `${appHome()}/${path}`;
    try {
      await writeTextFile(file, text, null);
    } catch (error) {
      // Already there (another window wrote it): fine; a read past 1 MiB rejects, it is there too.
      if ((await readTextFile(file).catch(() => "")) === null) return { state: "error", error: String(error.message || error) };
    }
    setShared(IMAGES, { ...(/** @type {object} */ (shared(IMAGES)) || {}), [path]: [width, height] });
    return { state: "ok", value: { path, width, height } };
  }

  // Dropdowns -------------------------------------------------------------

  /** A form entry, or one of the dropdowns that are not attributes: a relation's type, adding a watcher. */
  entry(attr) {
    const value = this.details[this.picked]?.value;
    if (attr === "relation_type") {
      return {
        attr, type: "select", options: RELATIONS, value: this.relType, text: RELATIONS.find((r) => r.id === this.relType).name,
        pick: (o, cx) => { this.relType = o.id; cx.notify(); },
      };
    }
    if (attr === "watcher") {
      return {
        attr, type: "select", optionsAttr: "assigned_to_id", value: null, text: "Add watcher…", placeholder: true, busyWith: "watch",
        exclude: new Set((value?.watchers || []).map((w) => w.id)),
        pick: (o, cx) => this.apply({ watch: o.id }, cx),
      };
    }
    return value?.form.find((f) => f.attr === attr);
  }

  optionsKey(attr) {
    const ticket = this.ticket();
    return `${ticket.source}:${this.details[ticket.key].value.scope}:${attr}`;
  }

  /** The open dropdown's options, filtered by what was typed; a nullable one starts with none. */
  menuItems() {
    const entry = this.menu && this.entry(this.menu);
    if (!entry) return [];
    const all = entry.options || this.options[this.optionsKey(entry.optionsAttr || entry.attr)]?.value || [];
    const query = this.search.value().trim().toLowerCase();
    return [...(entry.nullable ? [{ id: "", name: "(none)" }] : []), ...all]
      .filter((o) => !entry.exclude?.has(o.id) && (!query || o.name.toLowerCase().includes(query)));
  }

  toggleMenu(entry, cx) {
    const reopens = this.menu === null && Date.now() - this.closedAt < TWICE;
    if (this.menu === entry.attr || reopens) return this.closeMenu(cx);
    this.menu = entry.attr;
    this.menuAt = 0;
    this.editing = null;
    this.search.set_value("");
    cx.timer.after(50, () => this.focusSearch());
    const attr = entry.optionsAttr || entry.attr;
    const key = this.optionsKey(attr);
    if (!entry.options && this.options[key]?.state !== "ok" && this.options[key]?.state !== "loading") {
      const ticket = this.ticket();
      const source = this.sourceOf(ticket);
      const provider = PROVIDERS[source.kind];
      this.options[key] = { state: "loading" };
      cx.spawn(async (cx) => {
        const argv = provider.options(ticket, this.details[ticket.key].value, attr, this.scripts[provider.script]);
        this.options[key] = await run(source, argv, (out) => JSON.parse(out));
        this.focusSearch();
        cx.notify();
      });
    }
    cx.notify();
  }

  /** Typing filters a long dropdown; a short one has no field, and the keys stay with the panel (j/k, Enter). */
  focusSearch() {
    const entry = this.menu && this.entry(this.menu);
    const all = entry && (entry.options || this.options[this.optionsKey(entry.optionsAttr || entry.attr)]?.value);
    if (all && all.length >= FILTER_FROM) this.search.focus();
  }

  closeMenu(cx) {
    if (this.menu === null) return;
    this.menu = null;
    this.closedAt = Date.now();
    this.handle.focus();
    cx.notify();
  }

  /** A key on the panel (`name`: the character typed, else the key's name); true when taken. */
  key(e, cx) {
    const name = e.key_char && e.key_char.trim() ? e.key_char : e.key;
    const typing = !this.handle.is_focused();
    if (this.menu) {
      const items = this.menuItems();
      const by = { down: 1, up: -1, ...(!typing && { j: 1, k: -1 }) }[name];
      if (by) this.menuAt = Math.max(0, Math.min(Math.min(items.length, SHOWN) - 1, this.menuAt + by));
      else if (name === "enter" && !typing) { if (items[this.menuAt]) this.pickOption(items[this.menuAt], cx); }
      else if (name === "escape") this.closeMenu(cx);
      else return false;
      return true;
    }
    const ticket = this.ticket();
    const value = ticket && this.details[ticket.key]?.value;
    if (e.keystroke === "ctrl-enter" && typing && ticket) {
      if (this.editing === "description") this.apply({ attr: "description", value: this.description.value() }, cx);
      else if (this.editing) this.saveEdit(cx);
      else if (this.comment.value().trim()) this.apply({ comment: this.comment.value().trim() }, cx);
      else return false;
      return true;
    }
    if (name === "escape") {
      if (this.editing) this.cancel(cx);
      else if (typing) this.handle.focus();
      else if (this.picked) this.unpick(cx);
      else return false;
      return true;
    }
    if (typing || e.modifiers.control || e.modifiers.alt || e.modifiers.platform) return false;
    const keys = this.shownKeys, at = keys.indexOf(this.cursor);
    if (name === "j" || name === "k" || name === "down" || name === "up") {
      const next = keys[Math.max(0, Math.min(keys.length - 1, at + (name === "j" || name === "down" ? 1 : -1)))];
      if (!next) return true;
      this.cursor = next;
      this.listScroll.scroll_to_item(keys.indexOf(next));
      // Wide: the ticket shows beside the list as the keyboard moves; narrow: it would hide the list.
      if (!this.narrow || this.picked) this.pick(this.find(next), cx);
    } else if (name === "enter" || name === "o") { if (this.find(this.cursor)) this.pick(this.find(this.cursor), cx); }
    else if (name === "v" && !this.narrow) setShared(VIEW, shared(VIEW) === "board" ? "list" : "board");
    else if (name === "s") {
      const sources = this.shown(), i = sources.indexOf(this.current());
      if (sources.length > 1) this.choose(sources[(i + 1) % sources.length].name, cx);
    } else if (name === "r") this.refresh(cx);
    else if (name === "m") runCommand("leo-tabs.max");
    else if (name === "q") runCommand("leo-tabs.tickets");
    else if (name === "?") this.help = !this.help;
    else if (!value || this.saving) return false;
    else if (name === "t") { const title = value.form.find((f) => f.place === "title"); if (title) this.edit(title, cx); }
    else if (name === "S") { const status = value.form.find((f) => f.place === "status"); if (status) this.toggleMenu(status, cx); }
    else if (name === "e") this.edit({ attr: "description", value: value.description }, cx);
    else if (name === "c") this.comment.focus();
    else if (name === "w" && value.me && value.watchers) this.apply(value.watchers.some((w) => w.id === value.me) ? { unwatch: value.me } : { watch: value.me }, cx);
    else if (name === "y") this.copy(ticket, cx);
    else if (name === "b") cx.open_url(ticket.url);
    else return false;
    return true;
  }

  /** A ticket of the current source's list, by key. */
  find(key) {
    return (this.results[this.current()?.name]?.value || []).find((x) => x.key === key);
  }

  pickOption(option, cx) {
    const entry = this.entry(this.menu);
    this.closeMenu(cx);
    if (entry?.pick) entry.pick(option, cx);
    else if (entry && option.id !== entry.value) this.apply({ attr: entry.attr, value: option.id }, cx);
  }

  // Typing in place -------------------------------------------------------

  edit(entry, cx) {
    this.editing = entry.attr;
    this.menu = null;
    this.failed = "";
    const several = entry.type === "long" || entry.type === "lines";
    const state = entry.attr === "description" ? this.description : several ? this.lines : this.line;
    state.set_value(entry.attr === "description" ? (this.drafts[this.picked]?.description ?? entry.value) : String(entry.value ?? ""));
    state.focus();
    cx.notify();
  }

  cancel(cx) {
    if (this.editing === "description" && this.drafts[this.picked]) delete this.drafts[this.picked].description;
    this.editing = null;
    this.failed = "";
    this.handle.focus(); // the field is gone
    cx.notify();
  }

  saveEdit(cx) {
    const entry = this.entry(this.editing);
    if (!entry) return;
    const several = entry.type === "long" || entry.type === "lines";
    const typed = valueOf(entry, (several ? this.lines : this.line).value());
    if (typed.error) {
      this.failed = typed.error;
      cx.notify();
    } else {
      this.apply({ attr: entry.attr, value: typed.value }, cx);
    }
  }

  /** Sends one change, then reads the ticket and the list again. */
  apply(change, cx) {
    const ticket = this.ticket();
    if (!ticket || this.saving) return;
    cx.spawn(async (cx) => this.send(ticket, change, cx));
  }

  /** Sends the change; true when it went through. */
  async send(ticket, change, cx) {
    const what = change.attr || Object.keys(change)[0];
    const source = this.sourceOf(ticket);
    const provider = PROVIDERS[source.kind];
    this.saving = what;
    this.failed = "";
    cx.notify();
    let argv;
    try {
      argv = provider.update(ticket, change, this.scripts[provider.script]);
    } catch (error) {
      this.saving = "";
      this.failed = error.message;
      cx.notify();
      return false;
    }
    const result = await run(source, argv, () => true);
    this.saving = "";
    if (result.state === "error") {
      this.failed = result.error;
    } else {
      if (what === "comment") {
        if (this.picked === ticket.key) this.comment.set_value("");
        delete this.drafts[ticket.key]?.comment;
      }
      if (what === "description") delete this.drafts[ticket.key]?.description;
      if (what === "attach") {
        this.attaching = false;
        this.attachPath.set_value("");
        this.attachNote.set_value("");
      }
      if (what === "relate") {
        this.relTo.set_value("");
        this.relDelay.set_value("");
      }
      // The field is gone: the keyboard stays with the panel.
      if (this.picked === ticket.key && this.editing) { this.editing = null; this.handle.focus(); }
      // Another project lists other trackers, categories and versions.
      if (what === "project_id") this.options = {};
      this.loadDetail(ticket, cx);
      this.load(source, cx);
    }
    cx.notify();
    return result.state === "ok";
  }

  /** A card dropped on another column: that status, when the workflow allows it. */
  move(key, status, cx) {
    const ticket = (this.results[this.current()?.name]?.value || []).find((x) => x.key === key);
    if (!ticket || ticket.status === status || this.saving) return;
    this.moving = key;
    this.failed = "";
    cx.notify();
    cx.spawn(async (cx) => {
      const detail = this.details[key]?.value ? this.details[key] : await this.fetchDetail(ticket);
      const entry = detail.value?.form.find((f) => f.place === "status");
      const option = entry?.options?.find((o) => o.name === status);
      if (!detail.value) this.failed = `${ticket.id}: ${detail.error}`;
      else if (!option) this.failed = `${ticket.id} cannot go from ${ticket.status} to ${status}: the workflow does not allow it`;
      else if (await this.send(ticket, { attr: entry.attr, value: option.id }, cx)) {
        // Where it went, until the list read again says the same.
        ticket.rank = (this.results[ticket.source]?.value || []).find((x) => x.status === status)?.rank ?? ticket.rank;
        ticket.status = status;
      }
      this.moving = "";
      cx.notify();
    });
  }

  unpick(cx) {
    this.stash();
    this.picked = "";
    this.editing = null;
    this.menu = null;
    cx.notify();
  }

  ticket() {
    const source = this.current();
    return (source && this.results[source.name]?.value || []).find((x) => x.key === this.picked);
  }

  render(cx) {
    const t = theme();
    const off = this.off();
    const sources = this.shown();
    const source = this.current();
    const result = source && this.results[source.name];
    const all = result?.value || [];
    const chipOf = (x) => `${x.closed ? "cl" : "st"}:${x.status}`;
    const chips = [...new Set(all.map(chipOf))];
    const tickets = all.filter((x) => lit(off, chipOf(x)));
    const picked = this.ticket();
    const loading = result?.state === "loading";
    const narrow = (this.narrow = this.width < WIDE);
    const focused = this.handle.is_focused();
    this.shownKeys = tickets.map((x) => x.key);
    if (!this.shownKeys.includes(this.cursor)) this.cursor = picked && this.shownKeys.includes(picked.key) ? picked.key : this.shownKeys[0] || "";

    const chip = (key, label, figure) => {
      const on = lit(off, key);
      return h_flex().id(key).h(26).px(9).gap(6).items_center().rounded(7).border(1).flex_none()
        .border_color(on ? t.input : t.border).text_color(on ? t.foreground : t.dim)
        .cursor_pointer().hover((s) => s.bg(t.raised))
        .on_click((e, cx) => this.flip(key, cx, e.modifiers.control && chips))
        .child(label)
        .child(div().font_family(MONO).text_size(12).text_color(on ? t.muted : t.dim).child(figure));
    };
    const switcher = h_flex().gap(4).children(sources.map((s) => {
      const on = s === source;
      return h_flex().id(`source-${s.name}`).h(26).px(10).items_center().rounded(6).border(1).cursor_pointer().flex_none()
        .border_color(on ? t.accent : t.border).text_color(on ? t.foreground : t.muted)
        .hover((st) => st.bg(t.raised))
        .on_click((_e, cx) => this.choose(s.name, cx))
        .child(s.name);
    }));
    const state = loading ? div().text_color(t.muted).frames(SPINNER, 90)
      : result?.state === "error" ? div().min_w(0).truncate().text_color(t.ansi1).child(result.error)
      : result?.state === "ok" ? div().font_family(MONO).text_size(12).text_color(t.muted).child(String(all.length)) : null;
    const label = (text) => div().when(narrow, (el) => el.w_full()).when(!narrow, (el) => el.w(64)).flex_none().text_size(12).text_color(t.muted).child(text);
    const card = () => v_flex().rounded(10).border(1).border_color(t.border);
    const note = (text, color = t.muted) => div().p(14).text_color(color).child(text);

    const row = (x) => v_flex().id(`t-${x.key}`).px(12).py(8).gap(3).flex_none().border_b(1).border_color(t.border)
      .cursor_pointer().when(x.key === this.picked, (el) => el.bg(t.selected)).hover((s) => s.bg(t.raised))
      .when(focused && x.key === this.cursor && x.key !== this.picked, (el) => el.bg(t.hover))
      .on_click((_e, cx) => { this.cursor = x.key; this.pick(x, cx); })
      .child(h_flex().gap(8).items_center()
        .child(div().flex_none().font_family(MONO).text_size(12).text_color(t.muted).child(x.id))
        .child(div().flex_1().min_w(0).truncate().child(x.title)))
      .child(h_flex().gap(8).items_center().text_size(12).text_color(t.muted)
        .child(div().flex_none().child(x.status))
        .when(!!x.priority, (el) => el.child(div().flex_none().child(x.priority)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(x.project))
        .child(div().flex_none().font_family(MONO).text_color(t.dim).child(ago(x.updated))));

    const view = !narrow && shared(VIEW) === "board" ? "board" : "list";
    const views = h_flex().gap(4).children([["list", "List"], ["board", "Board"]].map(([key, text]) =>
      h_flex().id(`view-${key}`).h(26).px(10).items_center().rounded(6).border(1).cursor_pointer().flex_none()
        .border_color(view === key ? t.accent : t.border).text_color(view === key ? t.foreground : t.muted)
        .hover((st) => st.bg(t.raised))
        .on_click((_e, cx) => { setShared(VIEW, key); cx.notify(); })
        .child(text)));
    const empty = this.error ? note(this.error, t.ansi1)
      : note(loading ? "Loading…" : !source ? "No source for this computer in sources.json" : "No open tickets");
    const detail = picked && this.detail(t, picked, this.details[picked.key], cx);

    return v_flex().id("tickets").size_full().bg(t.background).text_color(t.foreground).text_size(13).p(narrow ? 12 : 18).gap(12)
      .rounded(10).border_1().border_color(focused || this.editing || this.menu ? t.input : t.border).overflow_hidden()
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (this.key(e, cx)) { cx.stop_propagation(); cx.notify(); } })
      .on_size_change((size, cx) => {
        const width = size.width / (settings().zoom || 1);
        if (Math.abs(width - this.width) < 1) return;
        this.width = width;
        cx.notify();
      })
      .on_mouse_up("left", (_e, cx) => { if (this.drag) { this.drag = null; cx.notify(); } })
      .child(h_flex().items_center().gap(8)
        // Narrow: the panel's tab already says Tickets.
        .when(!narrow || (sources.length <= 1 && !!source), (el) => el.child(div().min_w(0).truncate().font_semibold().pr(6).child(sources.length > 1 || !source ? "Tickets" : source.name)))
        .when(sources.length > 1, (el) => el.child(switcher))
        .when(!!state, (el) => el.child(state))
        .child(div().flex_1())
        .when(!narrow, (el) => el.child(views))
        .child(button(t, "refresh", narrow ? svg("mods/review/icons/refresh.svg").size(14) : "Refresh", !loading, (cx) => this.refresh(cx)))
        .child(maxButton(t)))
      .when(this.help, (el) => el.child(div().text_size(11).text_color(t.muted).whitespace_normal().child(HELP.join(" · "))))
      .when(chips.length > 0 && !(narrow && picked), (el) => el.child(h_flex().items_center().gap(6).flex_wrap()
        .child(label("Status"))
        .children(chips.map((key) => chip(key, key.slice(3), String(all.filter((x) => chipOf(x) === key).length))))))
      // Narrow: the list, or the picked ticket in its place.
      .when(narrow, (el) => el.child(picked
        ? card().id("detail").flex_1().min_h(0).overflow_y_scrollbar()
          .child(h_flex().px(12).pt(10).child(button(t, "back", "← Tickets", true, (cx) => this.unpick(cx))))
          .child(detail)
        : card().id("list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.listScroll)
          .children(tickets.map(row))
          .when(!tickets.length, (el) => el.child(empty))))
      .when(!narrow && view === "list", (el) => el.child(h_flex().flex_1().min_h(0).gap(14)
        .child(card().id("list").w(480).flex_none().overflow_y_scrollbar().track_scroll(this.listScroll)
          .children(tickets.map(row))
          .when(!tickets.length, (el) => el.child(empty)))
        .child(card().id("detail").flex_1().min_w(0).overflow_y_scrollbar()
          .child(detail || note("Pick a ticket")))))
      .when(!narrow && view === "board", (el) => el
        // Without a ticket open, a refused move has no detail to show in.
        .when(!!this.failed && !picked, (el) => el.child(div().text_color(t.ansi1).child(this.failed)))
        .child(h_flex().flex_1().min_h(0).gap(14)
          .child(tickets.length ? this.board(t, tickets) : card().flex_1().child(empty))
          .when(!!detail, (el) => el.child(card().id("detail").w(560).flex_none().overflow_y_scrollbar()
            .child(h_flex().px(16).pt(12).justify_end().child(button(t, "close-detail", "Close", true, (cx) => this.unpick(cx))))
            .child(detail)))));
  }

  /** A column per status the tickets are in; a card dropped on another column moves there. */
  board(t, tickets) {
    const dragged = this.drag && tickets.find((x) => x.key === this.drag);
    const cardOf = (x) => v_flex().id(`card-${x.key}`).p(10).gap(6).flex_none().rounded(8).border(1)
      .border_color(x.key === this.picked || (x.key === this.cursor && this.handle.is_focused()) ? t.input : t.border).bg(x.key === this.picked ? t.selected : t.surface)
      .cursor_grab().hover((s) => s.border_color(t.input))
      .when(x.key === this.drag || x.key === this.moving, (el) => el.opacity(0.5))
      .on_mouse_down("left", (_e, cx) => { this.drag = x.key; cx.notify(); })
      .on_click((_e, cx) => this.pick(x, cx))
      .child(h_flex().gap(8).items_center().text_size(12)
        .child(div().flex_none().font_family(MONO).text_color(t.muted).child(x.id))
        .child(div().flex_1())
        .child(div().flex_none().font_family(MONO).text_color(t.dim).child(x.key === this.moving ? "moving…" : ago(x.updated))))
      .child(div().child(x.title))
      .child(h_flex().gap(8).items_center().text_size(12).text_color(t.muted)
        .when(!!x.priority, (el) => el.child(div().flex_none().child(x.priority)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(x.project)));
    const column = ({ status, tickets }) => {
      const target = dragged && dragged.status !== status;
      return v_flex().id(`col-${status}`).w(280).h_full().flex_none().rounded(10).border(1)
        .border_color(target ? t.input : t.border).bg(t.background)
        .when(target, (el) => el.hover((s) => s.bg(t.raised).border_color(t.accent)))
        .on_mouse_up("left", (_e, cx) => {
          const key = this.drag;
          this.drag = null;
          if (key) this.move(key, status, cx);
          cx.notify();
        })
        .child(h_flex().h(38).px(12).gap(8).flex_none().items_center().border_b(1).border_color(t.border)
          .child(div().font_weight(500).child(status))
          .child(div().font_family(MONO).text_size(12).text_color(t.muted).child(String(tickets.length))))
        .child(v_flex().id(`cards-${status}`).flex_1().min_h(0).p(8).gap(8).overflow_y_scrollbar().children(tickets.map(cardOf)));
    };
    return h_flex().id("board").flex_1().min_w(0).h_full().gap(10).overflow_x_scrollbar().children(columns(tickets).map(column));
  }

  /** A dropdown: the trigger shows the value, the list opens under it. */
  dropdown(t, entry, wide) {
    const open = this.menu === entry.attr;
    const busy = this.saving === (entry.busyWith || entry.attr);
    const trigger = h_flex().id(`dd-${entry.attr}`).h(26).px(8).gap(6).items_center().rounded(6).border(1)
      .when(wide, (el) => el.w_full().max_w(420)).when(!wide, (el) => el.flex_none())
      .border_color(open ? t.input : t.border).bg(open ? t.raised : t.background)
      .when(!this.saving, (el) => el.cursor_pointer().hover((s) => s.bg(t.raised)).on_click((_e, cx) => this.toggleMenu(entry, cx)))
      .child(div().flex_1().min_w(0).truncate().text_color(entry.text && !entry.placeholder ? t.foreground : t.dim).child(busy ? "Saving…" : entry.text || "(none)"))
      .child(div().flex_none().text_color(t.muted).child(open ? "▴" : "▾"));
    if (!open) return Popup.new(`pop-${entry.attr}`, trigger).anchor("top_left");
    const loaded = entry.options ? { state: "ok" } : this.options[this.optionsKey(entry.optionsAttr || entry.attr)] || { state: "loading" };
    const items = this.menuItems();
    const total = (entry.options || loaded.value || []).length;
    const item = (o, i) => {
      const on = o.id === entry.value || (o.id === "" && entry.value === "");
      return h_flex().id(`opt-${entry.attr}-${o.id}`).h(28).px(8).gap(8).flex_none().items_center().rounded(6)
        .text_color(on ? t.foreground : t.muted).when(i === this.menuAt, (el) => el.bg(t.hover)).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => this.pickOption(o, cx))
        .child(div().w(14).flex_none().child(on ? "✓" : ""))
        .child(div().flex_1().min_w(0).truncate().child(o.name));
    };
    const list = v_flex().id(`list-${entry.attr}`).w(wide && !this.narrow ? 420 : 260).mt(6).p(4).gap(1).rounded(10).bg(t.popover)
      .border_1().border_color(t.border).shadow_lg().text_size(13)
      .on_mouse_down_out((_e, cx) => this.closeMenu(cx))
      .when(total >= FILTER_FROM, (el) => el.child(div().mb(4).rounded(6).border(1).border_color(t.input).bg(t.surface).px(6)
        .child(Input.new(this.search).w_full().text_size(12))))
      .child(v_flex().id(`items-${entry.attr}`).max_h(300).overflow_y_scroll()
        .when(loaded.state === "loading", (el) => el.child(div().p(8).text_color(t.muted).child("Loading…")))
        .when(loaded.state === "error", (el) => el.child(div().p(8).text_color(t.ansi1).child(loaded.error)))
        .when(loaded.state === "ok", (el) => el.children(items.slice(0, SHOWN).map(item))
          .when(!items.length, (el) => el.child(div().p(8).text_color(t.dim).child("Nothing matches")))
          .when(items.length > SHOWN, (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child(`${items.length - SHOWN} more: type to narrow`)))));
    return Popup.new(`pop-${entry.attr}`, trigger).anchor("top_left").content(list);
  }

  /** A typed value: shown, and an editor in its place once clicked. */
  typed(t, entry, look) {
    const several = entry.type === "long" || entry.type === "lines";
    if (this.editing === entry.attr) {
      const field = div().flex_1().min_w(0).rounded(6).border(1).border_color(t.input).bg(t.surface).px(6).py(several ? 4 : 0)
        .child(several ? Textarea.new(this.lines).w_full().text_size(12) : Input.new(this.line).w_full().text_size(look === "title" ? 15 : 12));
      return h_flex().flex_1().min_w(0).gap(6).items_start()
        .child(field)
        .child(button(t, `cancel-${entry.attr}`, "Cancel", true, (cx) => this.cancel(cx)))
        .child(button(t, `save-${entry.attr}`, this.saving === entry.attr ? "Saving…" : "Save", !this.saving, (cx) => this.saveEdit(cx), true));
    }
    const hint = entry.type === "date" ? "YYYY-MM-DD" : entry.type === "lines" ? "one per line" : "Set…";
    return div().id(`edit-${entry.attr}`).flex_1().min_w(0).px(4).py(3).rounded(5)
      .when(!this.saving, (el) => el.cursor_pointer().hover((s) => s.bg(t.raised)).on_click((_e, cx) => this.edit(entry, cx)))
      .child(entry.text === "" ? div().text_color(t.dim).child(hint) : div().child(String(entry.text)));
  }

  detail(t, x, d, cx) {
    const narrow = this.narrow;
    const value = d?.value;
    const markdown = (id, text) => v_flex().gap(8).children(inlineImages(text.replace(/\r\n/g, "\n"), value?.attachments).map((part, i) => part.image
      ? this.picture(t, x, part.image, cx)
      : TextView.markdown(`${id}-${i}`, part.text.replace(SOFT_BREAK, "$1  \n")).selectable(true)));
    const section = (title, extra) => h_flex().gap(8).items_center().text_size(12).text_color(t.muted)
      .child(div().flex_1().child(title)).when(!!extra, (el) => el.child(extra));
    const box = (child) => div().rounded(8).border(1).border_color(t.input).bg(t.surface).px(8).py(6).child(child);
    const titleEntry = value?.form.find((f) => f.place === "title");
    const statusEntry = value?.form.find((f) => f.place === "status");

    const watching = !!value?.me && !!value?.watchers && value.watchers.some((w) => w.id === value.me);
    const actions = [
      !!value?.me && !!value?.watchers && button(t, "watch-me", this.saving === (watching ? "unwatch" : "watch") ? "Saving…" : watching ? "Unwatch" : "Watch", !this.saving,
        (cx) => this.apply(watching ? { unwatch: value.me } : { watch: value.me }, cx)),
      button(t, "copy", this.copied === x.key ? "Copied" : "Copy link", true, (cx) => this.copy(x, cx)),
      button(t, "open", narrow ? "Open" : "Open in browser", true, (cx) => cx.open_url(x.url)),
    ].filter(Boolean);
    const title = v_flex().flex_1().min_w(0).text_size(15).font_weight(500)
      .child(div().font_family(MONO).text_size(13).text_color(t.muted).child(x.id))
      .child(titleEntry ? this.typed(t, titleEntry, "title") : div().child(x.title));
    // Narrow: the buttons go under the title.
    const head = v_flex().gap(8)
      .child(narrow ? title : h_flex().gap(10).items_start().child(title).children(actions))
      .when(narrow, (el) => el.child(h_flex().gap(6).flex_wrap().children(actions)))
      .child(h_flex().gap(8).flex_wrap().items_center().text_size(12).text_color(t.muted)
        .child(statusEntry ? this.dropdown(t, statusEntry, false) : div().text_color(t.foreground).child(x.status))
        .when(!!x.priority, (el) => el.child(x.priority))
        .child(div().text_color(t.dim).child(x.project))
        .child(div().font_family(MONO).text_color(t.dim).child(`updated ${ago(x.updated)} ago`)));

    const body = v_flex().p(narrow ? 12 : 16).gap(16).child(head)
      .when(!!this.failed, (el) => el.child(div().text_color(t.ansi1).child(this.failed)))
      .when(!!d?.error, (el) => el.child(div().text_color(t.ansi1).child(d.error)));
    if (!value) return body.child(d?.state === "error" ? div().text_color(t.ansi1).child(d.error) : div().text_color(t.muted).child("Loading…"));

    const rowOf = (name, control) => h_flex().gap(12).items_start().text_size(12)
      .child(div().w(narrow ? 96 : 140).flex_none().py(5).truncate().text_color(t.muted).child(name))
      .child(control);
    const form = value.form.filter((f) => !f.place).map((f) =>
      rowOf(f.label, f.type === "select" ? h_flex().flex_1().min_w(0).py(1).child(this.dropdown(t, f, true)) : this.typed(t, f)));
    const info = value.info.map(([name, text]) => rowOf(name, div().flex_1().min_w(0).px(4).py(5).child(String(text))));

    const editing = this.editing === "description";
    const drafted = this.drafts[x.key]?.description !== undefined;
    const descEntry = { attr: "description", value: value.description };
    const ready = !!this.comment.value().trim() && !this.saving;
    const remove = (key, run) => this.confirm === key
      ? button(t, `rm-${key}`, "Confirm", !this.saving, (cx) => this.confirmed(key, cx, () => run(cx)), true)
      : button(t, `rm-${key}`, "Remove", !this.saving, (cx) => this.confirmed(key, cx, () => run(cx)));
    const field = (state, w) => div().when(!!w, (el) => el.w(w).flex_none()).when(!w, (el) => el.flex_1().min_w(0))
      .rounded(6).border(1).border_color(t.input).bg(t.surface).px(6).child(Input.new(state).w_full().text_size(12));
    const dim = (text) => div().flex_none().font_family(MONO).text_size(12).text_color(t.dim).child(text);

    const attachments = value.attachments && v_flex().id("attachments").gap(6)
      .on_drop((e, cx) => this.drop(e.paths, cx))
      .child(section(value.attachments.length ? `${value.attachments.length} attachment${value.attachments.length > 1 ? "s" : ""} · drop files here to add` : "No attachments · drop files here to add",
        !this.attaching && button(t, "att-add", this.saving === "attach" ? "Uploading…" : "Add file", !this.saving, (cx) => { this.attaching = true; this.attachPath.focus(); cx.notify(); })))
      .children(value.attachments.map((a) => {
        const saved = this.downloads[a.id];
        const name = div().id(`att-${a.id}`).flex_1().min_w(0).truncate().cursor_pointer().hover((s) => s.text_color(t.accent))
          .on_click((_e, cx) => cx.open_url(a.url)).child(a.name);
        const meta = [dim(size(a.size)), div().flex_none().text_color(t.muted).child(a.author), dim(when(a.at))];
        const buttons = [
          button(t, `save-${a.id}`, saved?.state === "loading" ? "Saving…" : "Save", saved?.state !== "loading", (cx) => this.save(a, cx)),
          remove(`att:${a.id}`, (cx) => this.apply({ unattach: a.id }, cx)),
        ];
        // Narrow: the name and its buttons, then who and when.
        return v_flex().gap(2).text_size(12)
          .child(narrow
            ? h_flex().gap(8).items_center().child(name).children(buttons)
            : h_flex().gap(8).items_center().child(name).children(meta).children(buttons))
          .when(narrow, (el) => el.child(h_flex().gap(8).flex_wrap().items_center().children(meta)))
          .when(!!a.description, (el) => el.child(div().text_color(t.muted).child(a.description)))
          .when(saved?.state === "ok", (el) => el.child(div().font_family(MONO).text_color(t.dim).child(`saved to ${saved.value}`)))
          .when(saved?.state === "error", (el) => el.child(div().text_color(t.ansi1).child(saved.error)));
      }))
      .when(this.attaching, (el) => el.child(h_flex().gap(6).items_center().when(narrow, (el) => el.flex_wrap())
        .child(narrow ? field(this.attachPath).w_full() : field(this.attachPath))
        .child(narrow ? field(this.attachNote).w_full() : field(this.attachNote, 200))
        .child(button(t, "att-cancel", "Cancel", true, (cx) => { this.attaching = false; cx.notify(); }))
        .child(button(t, "att-upload", this.saving === "attach" ? "Uploading…" : "Upload", !this.saving, (cx) => this.attachTyped(cx), true))));

    const timed = this.relType === "precedes" || this.relType === "follows";
    const relations = value.relations && v_flex().gap(6)
      .child(section(value.relations.length ? `${value.relations.length} related ticket${value.relations.length > 1 ? "s" : ""}` : "No related tickets"))
      .children(value.relations.map((r) => {
        const id = div().id(`rel-${r.id}`).flex_none().font_family(MONO).cursor_pointer().hover((s) => s.text_color(t.accent))
          .on_click((_e, cx) => cx.open_url(r.url)).child(`#${r.to}`);
        const title = div().flex_1().min_w(0).truncate().child(r.title);
        const unrelate = remove(`rel:${r.id}`, (cx) => this.apply({ unrelate: r.id }, cx));
        // Narrow: the ticket on the first line, how it relates under it.
        return narrow
          ? v_flex().gap(2).text_size(12)
            .child(h_flex().gap(8).items_center().child(id).child(title).child(unrelate))
            .child(div().text_color(t.muted).child(`${r.label} · ${r.status}`))
          : h_flex().gap(8).items_center().text_size(12)
            .child(div().w(140).flex_none().truncate().text_color(t.muted).child(r.label))
            .child(id).child(title)
            .child(div().flex_none().text_color(t.muted).child(r.status))
            .child(unrelate);
      }))
      .child(h_flex().gap(6).items_center().when(narrow, (el) => el.flex_wrap())
        .child(div().w(200).flex_none().child(this.dropdown(t, this.entry("relation_type"), true)))
        .child(field(this.relTo, 110))
        .when(timed, (el) => el.child(field(this.relDelay, 80)))
        .when(!narrow, (el) => el.child(div().flex_1()))
        .child(button(t, "rel-add", this.saving === "relate" ? "Saving…" : "Add relation", !this.saving, (cx) => this.relate(cx), true)));

    const watchers = value.watchers && v_flex().gap(6)
      .child(section(value.watchers.length ? `${value.watchers.length} watcher${value.watchers.length > 1 ? "s" : ""}` : "No watchers"))
      .child(h_flex().gap(6).flex_wrap().items_center()
        .children(value.watchers.map((w) => h_flex().h(26).pl(9).pr(3).gap(4).items_center().rounded(7).border(1).border_color(t.border).flex_none()
          .child(w.name)
          .child(div().id(`unwatch-${w.id}`).px(5).rounded(5).text_color(this.confirm === `watch:${w.id}` ? t.ansi1 : t.muted)
            .when(!this.saving, (el) => el.cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground))
              .on_click((_e, cx) => this.confirmed(`watch:${w.id}`, cx, () => this.apply({ unwatch: w.id }, cx))))
            .child(this.confirm === `watch:${w.id}` ? "remove?" : "×"))))
        .child(div().w(220).flex_none().child(this.dropdown(t, this.entry("watcher"), true))));

    return body
      .child(v_flex().gap(2).children(form))
      .when(info.length > 0, (el) => el.child(v_flex().gap(0).children(info)))
      .child(v_flex().id("description").gap(8)
        .on_size_change((box, cx) => {
          const width = box.width / (settings().zoom || 1);
          if (Math.abs(width - this.textWidth) < 1) return;
          this.textWidth = width;
          cx.notify();
        })
        .child(section(drafted && !editing ? "Description · unsaved edit" : "Description", editing
          ? h_flex().gap(6)
            .child(button(t, "desc-cancel", "Cancel", true, (cx) => this.cancel(cx)))
            .child(button(t, "desc-save", this.saving === "description" ? "Saving…" : "Save", !this.saving,
              (cx) => this.apply({ attr: "description", value: this.description.value() }, cx), true))
          : button(t, "desc-edit", drafted ? "Continue editing" : "Edit", !this.saving, (cx) => this.edit(descEntry, cx))))
        .child(editing ? box(Textarea.new(this.description).w_full().text_size(13))
          : value.description ? markdown(`desc-${x.key}`, value.description) : div().text_color(t.dim).child("No description")))
      .when(!!attachments, (el) => el.child(attachments))
      .when(!!relations, (el) => el.child(relations))
      .when(!!watchers, (el) => el.child(watchers))
      .child(v_flex().gap(12).pt(12).border_t(1).border_color(t.border)
        .child(section(value.comments.length ? `${value.comments.length} comment${value.comments.length > 1 ? "s" : ""}` : "No comments"))
        .children(value.comments.map((c, i) => v_flex().gap(4)
          .child(h_flex().gap(8).text_size(12)
            .child(div().font_weight(500).child(c.author))
            .child(div().font_family(MONO).text_color(t.dim).child(when(c.at))))
          .child(markdown(`c-${x.key}-${i}`, c.body))))
        .child(box(Textarea.new(this.comment).w_full().text_size(13)))
        .child(h_flex().justify_end()
          .child(button(t, "comment", this.saving === "comment" ? "Saving…" : "Comment", ready,
            (cx) => this.apply({ comment: this.comment.value().trim() }, cx), true))));
  }
}

/** The maximize button every side panel has (leo-tabs does the work). */
function maxButton(t) {
  const max = findNode(layout(), "chat-view")?.hidden === true;
  return h_flex().id("panel-max").size(26).flex_none().items_center().justify_center().rounded(6).border(1).border_color(t.border)
    .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground))
    .on_click(() => runCommand("leo-tabs.max"))
    .child(svg(`mods/review/icons/${max ? "unzoom" : "zoom"}.svg`).size(14));
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

/** A small button; `primary` is the solid one (the action a form exists for). */
function button(t, id, text, enabled, onClick, primary = false) {
  return h_flex().id(id).h(26).px(10).flex_none().items_center().rounded(6).border(1)
    .border_color(primary && enabled ? t.solid : t.border)
    .bg(primary && enabled ? t.solid : t.background)
    .text_color(!enabled ? t.dim : primary ? t.solid_foreground : t.muted)
    .when(enabled, (el) => el.cursor_pointer().hover((s) => (primary ? s : s.bg(t.raised).text_color(t.foreground)))
      .on_click((_e, cx) => onClick(cx)))
    .child(text);
}

/** A local date and time, "2026-11-16 13:05". */
function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function run(source, argv, parse) {
  if (argv.includes(undefined) || argv.includes(null)) return { state: "error", error: "provider script not found" };
  try {
    const r = await exec(argv[0], argv.slice(1), { on: source.machine, timeout: TIMEOUT_MS });
    if (r.code === 127) return { state: "error", error: `no ${argv[0]}` };
    if (r.code !== 0) return { state: "error", error: (r.stderr || `exit ${r.code}`).trim().split("\n").pop() };
    return { state: "ok", value: parse(r.stdout) };
  } catch (error) {
    return { state: "error", error: String(error.message || error).split("\n")[0] };
  }
}
