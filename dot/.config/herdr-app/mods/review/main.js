// Review: the changes of the focused pane's repo, to read and comment on.
// It replaces Herdr's Changes panel (layouts/leo.json's `changes` block). Maximize
// (m, or leo-tabs.max) hides the chat so the panel fills the work area; the
// sidebar stays, so spaces still switch. What is shown is kept per repo in
// shared(`review:<machine>:<repo>`): the mode, base, open file, split, viewed
// marks and draft comments. Comments sit inline under their lines; Submit review
// and Ask open the send dialog (dialog.js), this mod opened as a dialog of itself.
// See .scratch/herdr-code-review/spec.md.

import { View, div, svg } from "gpui-kit";
import { Input, InputState, ScrollHandle, Scrollbar, Textarea, TextareaState, h_flex, v_flex } from "gpui-base";
import { checking, layout, nextCommand, openOverlay, props, run, setShared, settings, shared, theme, watchFolder } from "herdr";
import { Dialog } from "./dialog.js";
import { CHAR, ROW, layoutView, makeView, palette, sideways, splitRow, unifiedRow } from "./diffview.js";
import { commentMessage } from "./files.js";
import { openInNvim } from "./nvim.js";
import { EXPAND, commentSpan, firstShown, hunkSpan, stackItems } from "./patch.js";
import { branches, changedFiles, commitAll, compareFrom, defaultBase, fileDiff, findRepo, location } from "./git.js";

const POLL = 10000;
const SPLIT_MIN = 600; // design px of diff below which side by side is unified
const WIDE = 760; // design px of panel from which the file list sits beside the diff
const STEP = 60; // design px an h or l moves the text sideways
const COMPOSER = 164; // design px of the inline comment box
const STATUS = { A: "ansi2", D: "ansi1", U: "ansi1", R: "ansi4", M: "blocked" };
const DEFAULTS = { mode: "changes", base: null, open: null, split: false, viewed: {}, comments: [] };
const SIGN = { add: "+", del: "-", same: " " };
// The keys, as `?` lists them under the panel (key_down has them).
const HELP = [
  "j/k file", "n/p hunk", "↑↓ space ctrl-d/u g/G scroll", "h/l sideways", "c comment hunk", "C comment file",
  "S submit", "a ask", "v viewed", "u next unviewed", "b changes/branch", "B base", "s split", "f full file",
  "i commit", "o nvim", "y copy path", "r refresh", "m maximize", "q close", "? keys",
];

const icon = (name, size = 14) => svg(`mods/review/icons/${name}.svg`).size(size).flex_none();
const stop = (_event, cx) => cx.stop_propagation();

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** What a run of rows is about: { side, from, to }, or null when it has no lines. */
function linesOf(rows) {
  const body = rows.filter((row) => SIGN[row.kind]);
  if (!body.length) return null;
  const side = body.every((row) => row.kind === "del") ? "old" : "new";
  const numbers = body.map((row) => (side === "old" ? row.old : row.new)).filter((n) => n !== null);
  return { side, from: Math.min(...numbers), to: Math.max(...numbers) };
}

const excerptOf = (rows) => rows.filter((row) => SIGN[row.kind]).map((row) => SIGN[row.kind] + row.text);
const spanText = (at) => `${at.from === at.to ? `line ${at.from}` : `lines ${at.from}–${at.to}`}${at.side === "old" ? " (removed)" : ""}`;

export default class Review extends View {
  init(_props, cx) {
    // Opened as the send dialog: this copy is the dialog, nothing else.
    if (props()?.dialog) {
      this.dialog = new Dialog();
      this.dialog.init(_props, cx);
      return;
    }
    this.handle = cx.focus_handle();
    this.baseScroll = ScrollHandle.new();
    this.help = false; // the key list shows under the panel
    this.panelWidth = 0; // design px
    this.compose = null; // the open comment box: { path, whole, editing: a comment's id or null }
    this.repo = null; // { root, on, branch }
    this.files = [];
    this.view = null; // the open file's diff (diffview.js makeView)
    this.sel = null; // { anchor, head }: rows selected, unified indices
    // The diff scrolls itself: a GPUI list keeps the wheel and cannot scroll sideways.
    this.width = 0; // the diff's, design px
    this.height = 0;
    this.x = 0; // the text scrolled sideways, design px
    this.y = 0; // the rows scrolled down, design px
    this.spots = new Map(); // "<repo key>|<path>" -> { x, y }: where a file was left, this window only
    this.drag = null; // { axis, from, start, scale }: a scroll bar held at pointer `from`
    this.hunk = -1; // the hunk last jumped to
    this.commitInput = InputState.new({ placeholder: "Commit message" });
    this.commitInput.on("submit", (_e, cx) => this.commit(cx));
    this.note = TextareaState.new({ placeholder: "Leave a comment…", rows: 4 });
    // Enter adds; shift-enter is the textarea's own new line.
    this.note.on("submit", (e, cx) => { if (!e?.shift) this.addComment(cx); });
    // Which box has the keyboard: "note", "commit" or null.
    for (const [name, state] of [["commit", this.commitInput], ["note", this.note]]) {
      state.on("focus", (_e, cx) => { this.typing = name; cx.notify(); });
      state.on("blur", (_e, cx) => { if (this.typing === name) this.typing = null; cx.notify(); });
    }
    this.note.on("change", (_e, cx) => cx.notify());
    cx.spawn(async (cx) => {
      for (;;) {
        // From pane.go, leo-tabs showing the panel, or a popup over it closing: an open comment box keeps the keyboard.
        if ((await nextCommand()) === "focus") (this.compose ? this.note : this.handle).focus();
        cx.notify();
      }
    });
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(POLL, (cx) => this.refresh(cx));
  }

  // ---- state shared by the side panel and the dialog

  key() {
    return this.repo ? `review:${this.repo.on || ""}:${this.repo.root}` : null;
  }

  store() {
    const key = this.key();
    const st = { ...DEFAULTS, ...((key && shared(key)) || {}) };
    // Comments saved before they had ids.
    st.comments = st.comments.map((c, i) => (c.id ? c : { ...c, id: `old${i}` }));
    return st;
  }

  save(change) {
    const key = this.key();
    if (key) setShared(key, { ...this.store(), ...change });
  }

  leaveSpot(path) {
    if (this.key()) this.spots.set(`${this.key()}|${path}`, { x: this.x, y: this.y });
  }

  // ---- loading

  watch(cx) {
    const root = this.repo.root;
    if (this.repo.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch {
        this.watched = null;
      }
    });
  }

  refresh(cx, force = false) {
    if (this.loading || this.busy) return;
    const where = location();
    const context = JSON.stringify(where);
    if (context !== this.context) {
      this.context = context;
      if (this.view) this.leaveSpot(this.view.path);
      Object.assign(this, { repo: null, files: [], view: null, sel: null, compose: null, error: null, problem: null, watched: null, limited: false });
    }
    if (!where.cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const repo = await findRepo(where.cwd, where.on);
        if (this.context !== context) return;
        if (!repo) {
          Object.assign(this, { repo: null, files: [], view: null, error: "Not a git repository" });
          return;
        }
        this.repo = repo;
        let st = this.store();
        if (st.mode === "branch" && !st.base) {
          this.save({ base: await defaultBase(repo) });
          st = this.store();
        }
        const from = await compareFrom(repo, st.mode, st.base);
        const { files, limited } = await changedFiles(repo, from);
        if (this.context !== context) return;
        Object.assign(this, { files, limited, from, compared: `${st.mode}|${st.base}`, error: null });
        this.watch(cx);
        const path = this.current();
        if (path) await this.load(path, cx, force);
        else this.view = null;
      } catch (e) {
        if (this.context === context) this.error = String(e.message || e);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  /** The file shown: the one picked, while it is still changed; else the first. */
  current() {
    const open = this.store().open;
    return this.files.some((f) => f.path === open) ? open : this.files[0]?.path || null;
  }

  async load(path, cx, force) {
    const file = this.files.find((f) => f.path === path);
    if (!file) return;
    const from = this.from, context = this.context;
    try {
      const loaded = await fileDiff(this.repo, from, file);
      if (this.context !== context || this.from !== from) return;
      if (file.fresh) file.add = loaded.newLines ? loaded.newLines.length : 0;
      const old = this.view;
      // The same diff: keep its folds and the selection.
      if (!force && old && old.path === path && old.from === from && old.text === loaded.patch) return;
      const view = makeView(path, loaded);
      view.from = from;
      view.file = file;
      if (old && old.path === path) {
        view.folds = old.folds;
        layoutView(view);
      } else {
        if (old) this.leaveSpot(old.path);
        this.sel = null;
        this.hunk = -1;
        ({ x: this.x, y: this.y } = this.spots.get(`${this.key()}|${path}`) || { x: 0, y: 0 });
      }
      this.view = view;
      this.problem = null;
    } catch (e) {
      if (this.context === context) {
        this.view = null;
        this.problem = `Cannot show this diff: ${e.message || e}`;
      }
    }
    cx.notify();
  }

  open(path, cx) {
    this.save({ open: path });
    this.show(path, cx);
  }

  show(path, cx) {
    this.wanted = path;
    if (this.compose && this.compose.path !== path) {
      this.compose = null;
      this.note.set_value("");
    }
    this.sel = null;
    this.problem = null;
    this.notice = null;
    cx.spawn(async (cx) => this.load(path, cx));
  }

  // ---- what the person does

  setMode(mode, cx) {
    if (this.store().mode === mode) return;
    this.save({ mode });
    this.view = null;
    this.refresh(cx);
  }

  setBase(base, cx) {
    this.picking = null;
    this.save({ base });
    this.view = null;
    this.refresh(cx);
  }

  pickBase(cx) {
    if (this.picking) { this.picking = null; cx.notify(); return; }
    if (!this.repo || this.store().mode !== "branch") return;
    this.picking = [];
    cx.spawn(async (cx) => {
      try {
        this.picking = await branches(this.repo);
        this.pickAt = Math.max(0, this.picking.indexOf(this.store().base));
        this.baseScroll.scroll_to_item(this.pickAt);
      } catch (e) { this.picking = null; this.problem = String(e.message || e); }
      cx.notify();
    });
  }

  /** j/k (arrows) through the base list, Enter takes one, Esc closes it (key_down). */
  pickKey(name) {
    const list = this.picking;
    if (!list.length) return false;
    const by = { j: 1, down: 1, k: -1, up: -1 }[name];
    if (by) {
      this.pickAt = Math.max(0, Math.min(list.length - 1, this.pickAt + by));
      this.baseScroll.scroll_to_item(this.pickAt);
      return true;
    }
    return false;
  }

  viewed(file) {
    const mark = this.store().viewed[file.path];
    if (!mark || mark.stat !== `${file.add}/${file.del}`) return false;
    // Marked before its diff loaded: no hash to compare.
    return !(mark.hash && this.view && this.view.path === file.path && this.view.hash !== mark.hash);
  }

  toggleViewed(file) {
    const viewed = { ...this.store().viewed };
    if (this.viewed(file)) delete viewed[file.path];
    else viewed[file.path] = { stat: `${file.add}/${file.del}`, hash: this.view?.path === file.path ? this.view.hash : null };
    this.save({ viewed });
  }

  step(by, cx) {
    const at = this.files.findIndex((f) => f.path === this.current());
    const next = this.files[Math.max(0, Math.min(this.files.length - 1, at + by))];
    if (next) this.open(next.path, cx);
  }

  /** The next unviewed file after this one. */
  nextUnviewed(cx) {
    const at = this.files.findIndex((f) => f.path === this.current());
    const order = [...this.files.slice(at + 1), ...this.files.slice(0, at)];
    const next = order.find((f) => !this.viewed(f));
    if (next) this.open(next.path, cx);
  }

  /** The rows that head a hunk, in order. */
  hunkHeads() {
    return this.view ? this.view.rows.flatMap((row, index) => (row.kind === "hunk" ? [index] : [])) : [];
  }

  /** `c`: the comment box under the hunk last jumped to (n/p), the first before any jump. */
  commentHunk(cx) {
    const heads = this.hunkHeads();
    const span = heads.length ? hunkSpan(this.view.rows, heads[Math.max(0, this.hunk)]) : null;
    if (!span) return;
    this.sel = { anchor: span[0], head: span[1] };
    this.compose = { path: this.view.path, whole: false, editing: null };
    this.note.set_value("");
    this.focusNote(cx);
  }

  /** Scrolls the diff `by` design px (clamped when drawn). */
  scrollBy(by) {
    this.y = Math.max(0, this.y + by);
  }

  jumpHunk(by) {
    const view = this.view;
    if (!view) return;
    const heads = this.hunkHeads();
    if (!heads.length) return;
    this.hunk = Math.max(0, Math.min(heads.length - 1, this.hunk + by));
    const line = this.splitShown() ? view.pairOf[heads[this.hunk]] : heads[this.hunk];
    // Where it was last drawn: comments above push it down. Clamped when drawn.
    const at = this.stack ? this.stack.items.findIndex((item) => item.line === line) : -1;
    this.y = at >= 0 ? this.stack.tops[at] : line * ROW;
  }

  toggleFull() {
    const view = this.view;
    if (!view) return;
    this.refold(view.folds === "all" ? {} : "all");
  }

  /** New folds: the rows move, and a selection follows its lines. */
  refold(folds) {
    const view = this.view;
    const at = linesOf(this.selectedRows());
    view.folds = folds;
    layoutView(view);
    const span = at && commentSpan(view.rows, at);
    this.sel = span ? { anchor: span[0], head: span[1] } : null;
  }

  splitShown() {
    return this.store().split && (this.width === 0 || this.width >= SPLIT_MIN);
  }

  // ---- maximized: the chat hidden, the panel across the work area (leo-tabs does it)

  expandable() {
    return Boolean(findNode(layout(), "chat-view") && findNode(layout(), "panel"));
  }

  expanded() {
    return findNode(layout(), "chat-view")?.hidden === true;
  }

  toggleExpand() {
    if (this.expandable()) run("leo-tabs.max");
  }

  // ---- comments and questions

  /** The row a click on line `key` means (a row's index, or a side-by-side pair's), or -1. */
  rowAt(key) {
    const view = this.view;
    if (!view) return -1;
    if (!this.splitShown()) return view.rows[key] ? key : -1;
    const pair = view.pairs[key];
    return pair ? pair.right ?? pair.left : -1;
  }

  /** The rows a click on row `index` targets: itself, or a header's hunk. Null for a fold. */
  targetOf(index) {
    const row = this.view.rows[index];
    if (row.kind === "gap") return null;
    return row.kind === "hunk" ? hunkSpan(this.view.rows, index) : [index, index];
  }

  selRange() {
    return this.sel ? [Math.min(this.sel.anchor, this.sel.head), Math.max(this.sel.anchor, this.sel.head)] : null;
  }

  /** A click on a line: opens a fold, or opens the comment box there, or widens it to the line. */
  clickRow(key, cx) {
    const view = this.view;
    const index = this.rowAt(key);
    if (index < 0) return;
    const row = view.rows[index];
    if (row.kind === "gap") {
      if (!view.newLines || view.folds === "all") return;
      this.refold({ ...view.folds, [row.gap]: (view.folds[row.gap] || 0) + EXPAND });
      cx.notify();
      return;
    }
    let span = this.targetOf(index);
    if (!span) return;
    const c = this.compose;
    const open = c && !c.whole && c.path === view.path ? this.selRange() : null;
    if (open) {
      const inside = span[0] >= open[0] && span[1] <= open[1];
      // A click inside the lines clears them, while there is nothing to lose; outside, it widens them.
      if (inside && !c.editing && !this.note.value().trim()) return this.closeComposer(cx);
      span = inside ? open : [Math.min(span[0], open[0]), Math.max(span[1], open[1])];
    }
    this.sel = { anchor: span[0], head: span[1] };
    this.compose = { path: view.path, whole: false, editing: open ? c.editing : null };
    this.focusNote(cx);
  }

  /** The speech bubble on a file: the comment box for the file as a whole. */
  commentFile(path, cx) {
    const c = this.compose;
    if (c?.whole && c.path === path && !c.editing && !this.note.value().trim()) return this.closeComposer(cx);
    if (this.current() !== path) this.open(path, cx);
    this.sel = null;
    this.compose = { path, whole: true, editing: null };
    this.y = 0;
    this.focusNote(cx);
  }

  editComment(comment, cx) {
    const span = comment.whole || !this.view ? null : commentSpan(this.view.rows, comment);
    this.sel = span ? { anchor: span[0], head: span[1] } : null;
    this.compose = { path: comment.path, whole: Boolean(comment.whole), editing: comment.id };
    this.note.set_value(comment.text);
    this.focusNote(cx);
  }

  focusNote(cx) {
    this.reveal = true; // the box scrolls into view when drawn
    this.note.focus();
    // Again once the box is drawn.
    cx.timer.after(300, () => this.note.focus());
    cx.notify();
  }

  closeComposer(cx) {
    this.compose = null;
    this.sel = null;
    this.note.set_value("");
    this.handle.focus();
    cx.notify();
  }

  selectedRows() {
    const range = this.selRange();
    return range && this.view ? this.view.rows.slice(range[0], range[1] + 1) : [];
  }

  addComment(cx) {
    const c = this.compose;
    const text = this.note.value().trim();
    if (!c || !text) return;
    const comments = this.store().comments;
    const old = comments.find((x) => x.id === c.editing);
    const rows = !c.whole && this.view?.path === c.path ? this.selectedRows() : [];
    const at = linesOf(rows);
    let comment;
    if (c.whole) comment = { path: c.path, whole: true, text };
    else if (at) comment = { path: c.path, ...at, excerpt: excerptOf(rows), text };
    // Its lines left the diff: only the text changes.
    else if (old) comment = { ...old, text };
    else return;
    comment.id = old ? old.id : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.save({ comments: old ? comments.map((x) => (x.id === old.id ? comment : x)) : [...comments, comment] });
    this.closeComposer(cx);
  }

  deleteComment(id, cx) {
    this.save({ comments: this.store().comments.filter((c) => c.id !== id) });
    if (this.compose?.editing === id) this.closeComposer(cx);
    else cx.notify();
  }

  /** What is reviewed, in words: "the uncommitted changes in /src/app". */
  about() {
    const st = this.store();
    const what = st.mode === "branch" ? `the changes since ${st.base}` : "the uncommitted changes";
    return `${what} in ${this.repo.root}${this.repo.on ? ` (on ${this.repo.on})` : ""}`;
  }

  openDialog(kind, title, context, clear) {
    openOverlay({ mod: "review", kind: "dialog", width: 760, height: 0.8, props: { dialog: kind, title, context, clear } });
  }

  submitReview() {
    const comments = this.store().comments;
    if (!comments.length || !this.repo) return;
    const n = comments.length;
    this.openDialog("review", `${n} comment${n === 1 ? "" : "s"}`, commentMessage(comments, this.about()), { key: this.key(), ids: comments.map((c) => c.id) });
  }

  /** Ask about rows [a, b] of the open diff, or the whole diff without `span`. */
  askAbout(span) {
    const view = this.view;
    if (!view || !this.repo) return;
    if (!span) {
      this.openDialog("ask", view.path, `The diff of ${view.path}, ${this.about()}:\n\`\`\`diff\n${view.text.trim()}\n\`\`\``);
      return;
    }
    const rows = view.rows.slice(span[0], span[1] + 1);
    const at = linesOf(rows);
    if (!at) return;
    const where = `${view.path}, ${spanText(at)}`;
    this.openDialog("ask", where, `In ${where}, of ${this.about()}:\n\`\`\`diff\n${excerptOf(rows).join("\n")}\n\`\`\``);
  }

  /** A right-click on a line: ask about it (a header: its hunk). */
  askRow(key) {
    const index = this.rowAt(key);
    const span = index < 0 ? null : this.targetOf(index);
    if (span) this.askAbout(span);
  }

  copyPath(cx) {
    const path = this.view?.path;
    if (!path) return;
    cx.write_to_clipboard(path);
    this.notice = `Copied ${path}`;
  }

  openEditor(cx) {
    const path = this.view?.path, repo = this.repo;
    if (!path || !repo || this.view.file.status === "D") return;
    cx.spawn(async (cx) => {
      try { await openInNvim(repo, path); } catch (e) { this.problem = `Cannot open Neovim: ${e.message || e}`; }
      cx.notify();
    });
  }

  commit(cx) {
    const message = this.commitInput.value().trim();
    if (!message || !this.repo || this.busy || this.loading) return;
    const repo = this.repo, context = this.context;
    this.busy = true;
    this.problem = null;
    cx.spawn(async (cx) => {
      try {
        await commitAll(repo, message);
        if (this.context === context) this.commitInput.set_value("");
      } catch (e) {
        if (this.context === context) this.problem = `Commit failed: ${e.message || e}`;
      } finally {
        this.busy = false;
        this.refresh(cx);
        cx.notify();
      }
    });
    cx.notify();
  }

  key_down(e, cx) {
    if (e.key === "escape") {
      if (this.compose) { this.closeComposer(cx); cx.stop_propagation(); return; }
      if (this.typing) { this.typing = null; this.handle.focus(); cx.stop_propagation(); cx.notify(); return; }
      if (this.picking) { this.picking = null; cx.stop_propagation(); cx.notify(); }
      else if (this.help) { this.help = false; cx.stop_propagation(); cx.notify(); }
      return;
    }
    if (this.typing || e.modifiers.alt || e.modifiers.platform) return;
    const page = Math.max(ROW, this.height - 2 * ROW);
    if (e.modifiers.control) {
      const half = { "ctrl-d": page / 2, "ctrl-u": -page / 2 }[e.keystroke];
      if (half) { this.scrollBy(half); cx.stop_propagation(); cx.notify(); }
      return;
    }
    // The character typed, so Shift+c is "C" on every layout; named keys (space, down) by name.
    const name = e.key_char && e.key_char.trim() ? e.key_char : e.key;
    if (this.picking) {
      if (name === "enter") { const base = this.picking[this.pickAt]; if (base) this.setBase(base, cx); }
      else if (!this.pickKey(name)) return;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    const actions = {
      j: () => this.step(1, cx),
      k: () => this.step(-1, cx),
      n: () => this.jumpHunk(1),
      p: () => this.jumpHunk(-1),
      u: () => this.nextUnviewed(cx),
      v: () => { const file = this.files.find((f) => f.path === this.current()); if (file) this.toggleViewed(file); },
      s: () => this.save({ split: !this.store().split }),
      f: () => this.toggleFull(),
      m: () => this.toggleExpand(),
      r: () => this.refresh(cx, true),
      h: () => { this.x = Math.max(0, this.x - STEP); },
      l: () => { this.x += STEP; }, // clamped when drawn
      c: () => (this.compose ? this.note.focus() : this.commentHunk(cx)),
      C: () => { if (this.view) this.commentFile(this.view.path, cx); },
      S: () => this.submitReview(),
      a: () => this.askAbout(null),
      y: () => this.copyPath(cx),
      o: () => this.openEditor(cx),
      b: () => this.setMode(this.store().mode === "branch" ? "changes" : "branch", cx),
      B: () => this.pickBase(cx),
      i: () => { if (this.store().mode === "changes") this.commitInput.focus(); },
      q: () => { if (this.expandable()) run("leo-tabs.changes"); },
      "?": () => { this.help = !this.help; },
      down: () => this.scrollBy(ROW),
      up: () => this.scrollBy(-ROW),
      space: () => this.scrollBy(e.modifiers.shift ? -page : page),
      pagedown: () => this.scrollBy(page),
      pageup: () => this.scrollBy(-page),
      g: () => { this.y = 0; },
      G: () => { this.y = Infinity; },
    };
    const action = actions[name];
    if (!action) return;
    action();
    cx.stop_propagation();
    cx.notify();
  }

  // ---- drawing

  render(cx) {
    if (this.dialog) return this.dialog.render(cx);
    if (JSON.stringify(location()) !== this.context) this.refresh(cx);
    const t = theme();
    const st = this.store();
    // Another copy (the dialog, the panel) picked another file or mode.
    if (this.repo && !this.loading && this.compared !== undefined && this.compared !== `${st.mode}|${st.base}`) this.refresh(cx);
    else if (this.view && this.current() && this.view.path !== this.current() && this.wanted !== this.current() && !this.loading) this.show(this.current(), cx);
    this.wide = this.panelWidth >= WIDE;
    const body = this.wide
      ? h_flex()
          .flex_1()
          .min_h(0)
          .items_start()
          .child(v_flex().w(320).h_full().flex_none().border_r(1).border_color(t.border).child(this.fileList(t, true)).child(this.submitBar(t)).when(st.mode === "changes", (el) => el.child(this.commitBox(t))))
          .child(v_flex().flex_1().min_w(0).h_full().child(this.fileHeader(t)).child(this.diff(t)))
      : v_flex()
          .flex_1()
          .min_h(0)
          .child(this.fileList(t, false))
          .child(this.fileHeader(t))
          .child(this.diff(t))
          .child(this.submitBar(t))
          .when(st.mode === "changes", (el) => el.child(this.commitBox(t)));
    return v_flex()
      .id("review")
      .size_full()
      .min_h(0)
      .rounded(10)
      .border_1()
      .border_color(t.border)
      .overflow_hidden()
      .on_size_change((size, cx) => {
        const width = size.width / (settings().zoom || 1);
        if (Math.abs(width - this.panelWidth) < 1) return;
        this.panelWidth = width;
        cx.notify();
      })
      // The panel's keys are live: the same edge a focused terminal pane gets.
      .when(this.handle.is_focused() || Boolean(this.typing), (el) => el.border_color(t.input))
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(13)
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key_down(e, cx))
      // A scroll bar keeps following the pointer anywhere in the panel while held.
      .on_mouse_move((e, cx) => {
        const drag = this.drag;
        if (!drag) return;
        this[drag.axis] = drag.start + ((e.position[drag.axis] - drag.from) / (settings().zoom || 1)) * drag.scale;
        cx.notify();
      })
      .on_mouse_up("left", () => { this.drag = null; })
      .child(this.header(t))
      .when(Boolean(this.picking), (el) => el.child(this.basePicker(t)))
      .when(Boolean(this.problem || this.notice), (el) =>
        el.child(
          h_flex().px(12).py(4).gap(8).text_size(11).border_b(1).border_color(t.border)
            .text_color(this.problem ? t.ansi1 : t.muted)
            .child(div().flex_1().min_w(0).child(this.problem || this.notice))
            .child(div().id("review-note-close").cursor_pointer().on_click((_e, cx) => { this.problem = null; this.notice = null; cx.notify(); }).child(icon("close", 12))),
        ),
      )
      .child(body)
      .when(this.help, (el) => el.child(
        div().flex_none().px(10).py(6).border_t(1).border_color(t.border).bg(t.chrome).text_size(11).text_color(t.muted).whitespace_normal()
          .child(HELP.join(" · ")),
      ));
  }

  button(t, id, content, action, { on = false, title } = {}) {
    return h_flex()
      .id(id)
      .h(24)
      .px(6)
      .gap(4)
      .flex_none()
      .items_center()
      .rounded(6)
      .text_size(12)
      .cursor_pointer()
      .bg(on ? t.selected : t.background)
      .text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { action(cx); cx.notify(); })
      .child(content)
      .when(Boolean(title), (el) => el.child(title));
  }

  header(t) {
    const st = this.store();
    const add = this.files.reduce((n, f) => n + f.add, 0);
    const del = this.files.reduce((n, f) => n + f.del, 0);
    const seen = this.files.filter((f) => this.viewed(f)).length;
    const segment = (mode, label) =>
      div()
        .id(`review-mode-${mode}`)
        .px(8)
        .h(20)
        .flex()
        .items_center()
        .rounded(5)
        .text_size(12)
        .when(st.mode === mode, (el) => el.bg(t.background).text_color(t.foreground))
        .when(st.mode !== mode, (el) => el.text_color(t.muted).cursor_pointer().hover((s) => s.text_color(t.foreground)))
        .on_click((_e, cx) => this.setMode(mode, cx))
        .child(label);
    const top = h_flex()
      .h(36)
      .px(10)
      .gap(6)
      .items_center()
      .child(h_flex().p(2).rounded(7).bg(t.surface).child(segment("changes", "Changes")).child(segment("branch", "Branch")))
      .child(div().flex_1())
      .child(this.button(t, "review-split", icon("split-right"), () => this.save({ split: !st.split }), { on: st.split }))
      .child(this.button(t, "review-refresh", icon("refresh"), (cx) => this.refresh(cx, true)))
      .when(this.expandable(), (el) => el.child(this.button(t, "review-max", icon(this.expanded() ? "unzoom" : "zoom"), () => this.toggleExpand())));
    const info = h_flex()
      .h(24)
      .px(12)
      .pb(6)
      .gap(8)
      .items_center()
      .text_size(11)
      .text_color(t.dim)
      .child(div().min_w(0).truncate().child(this.repo ? `${this.repo.root.split("/").pop()} · ${this.repo.branch}` : this.error || (this.loading ? "Loading…" : "No folder")))
      .when(st.mode === "branch" && Boolean(this.repo), (el) =>
        el.child(
          h_flex().id("review-base").gap(3).px(5).rounded(4).border_1().border_color(t.border).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.pickBase(cx))
            .child(`vs ${st.base || "…"}`)
            .child(icon("chevron-down", 10)),
        ),
      )
      .child(div().flex_1())
      .child(`${this.files.length} files`)
      .child(div().text_color(t.ansi2).child(`+${add}`))
      .child(div().text_color(t.ansi1).child(`−${del}`))
      .when(this.files.length > 0, (el) => el.child(`${seen}/${this.files.length} viewed`));
    return v_flex().flex_none().border_b(1).border_color(t.border).bg(t.chrome).child(top).child(info);
  }

  basePicker(t) {
    const st = this.store();
    return v_flex()
      .id("review-base-list")
      .max_h(220)
      .flex_none()
      .overflow_y_scroll()
      .track_scroll(this.baseScroll)
      .p(4)
      .border_b(1)
      .border_color(t.border)
      .bg(t.surface)
      .when(!this.picking.length, (el) => el.child(div().p(6).text_color(t.dim).child("Loading branches…")))
      .children(
        this.picking.map((name, i) =>
          div().id(`review-base-${name}`).h(24).px(8).flex().items_center().rounded(5).cursor_pointer().text_size(12)
            .when(name === st.base, (el) => el.bg(t.selected))
            .when(i === this.pickAt, (el) => el.border_1().border_color(t.input))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.setBase(name, cx))
            .child(name),
        ),
      );
  }

  fileList(t, tall) {
    const current = this.current();
    const comments = this.store().comments;
    // Draft comments on files no longer changed (e.g. committed): not drawn anywhere else.
    const gone = [...new Set(comments.map((c) => c.path))].filter((p) => !this.files.some((f) => f.path === p));
    const list = v_flex()
      .id("review-files")
      .absolute()
      .inset_0()
      .overflow_y_scroll()
      .p(4)
      .children(
        this.files.map((f) => {
          const parts = f.path.split("/");
          const name = parts.pop();
          const seen = this.viewed(f);
          const notes = comments.filter((c) => c.path === f.path).length;
          const whole = this.compose?.whole && this.compose.path === f.path;
          return h_flex()
            .id(`review-file-${f.path}`)
            .h(26)
            .flex_none()
            .px(6)
            .gap(6)
            .items_center()
            .rounded(6)
            .cursor_pointer()
            .when(current === f.path, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.open(f.path, cx))
            .child(
              div().id(`review-seen-${f.path}`).size(14).flex_none().flex().items_center().justify_center().rounded(3).border_1()
                .border_color(seen ? t.accent : t.border)
                .when(seen, (el) => el.bg(t.accent).text_color(t.accent_foreground).child(icon("check", 10)))
                .on_click((_e, cx) => { cx.stop_propagation(); this.toggleViewed(f); cx.notify(); }),
            )
            .child(div().w(12).flex_none().text_size(11).text_color(t[STATUS[f.status]] || t.muted).child(f.status))
            .child(
              h_flex().flex_1().min_w(0).when(seen, (el) => el.text_color(t.dim))
                .child(div().text_color(t.dim).truncate().child(parts.length ? `${parts.join("/")}/` : ""))
                .child(div().flex_none().max_w(260).truncate().child(name)),
            )
            // A speech bubble: the file's comment count, and a click comments on the whole file.
            .child(
              h_flex().id(`review-file-note-${f.path}`).h(18).min_w(18).px(notes ? 4 : 0).gap(3).flex_none().items_center().justify_center().rounded(4).text_size(11)
                .text_color(notes || whole ? t.foreground : t.dim)
                .when(notes > 0 || whole, (el) => el.bg(t.raised))
                .hover((s) => s.bg(t.hover).text_color(t.foreground))
                .on_click((_e, cx) => { cx.stop_propagation(); this.commentFile(f.path, cx); })
                .when(notes > 0, (el) => el.child(String(notes)))
                .child(icon("comment", notes ? 11 : 12)),
            )
            .when(f.binary, (el) => el.child(div().text_size(11).text_color(t.dim).child("bin")))
            .when(f.add > 0, (el) => el.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`)))
            .when(f.del > 0, (el) => el.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
        }),
      )
      .children(
        gone.map((path) =>
          h_flex().id(`review-gone-${path}`).h(26).flex_none().px(6).gap(6).items_center().text_color(t.dim)
            .child(icon("comment", 11))
            .child(div().flex_1().min_w(0).truncate().child(`${comments.filter((c) => c.path === path).length} · ${path} (no longer changed)`))
            .child(this.button(t, `review-gone-x-${path}`, icon("close", 12), () =>
              this.save({ comments: this.store().comments.filter((c) => c.path !== path) }))),
        ),
      )
      .when(!this.files.length, (el) =>
        el.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.repo ? "No changes" : "No folder"))),
      )
      .when(this.limited, (el) => el.child(div().p(8).text_size(11).text_color(t.dim).child("Showing the first 1,000 files")));
    return div()
      .relative()
      .when(tall, (el) => el.flex_1().min_h(80))
      .when(!tall, (el) => el.flex_none().h(Math.min(240, Math.max(40, (this.files.length + gone.length) * 26 + 10))).border_b(1).border_color(t.border))
      .child(list)
      .child(Scrollbar.vertical("review-files").absolute().inset_0());
  }

  fileHeader(t) {
    const view = this.view;
    const file = view?.file;
    if (!file) return div();
    const st = this.store();
    const seen = this.viewed(file);
    return h_flex()
      .h(30)
      .flex_none()
      .px(10)
      .gap(6)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .bg(t.chrome)
      .child(div().min_w(0).truncate().text_size(12).child(file.old !== file.path ? `${file.old} → ${file.path}` : file.path))
      .child(this.button(t, "review-copy-path", icon("copy", 12), (cx) => this.copyPath(cx)))
      .when(file.status !== "D", (el) => el.child(this.button(t, "review-nvim", icon("nvim", 12), (cx) => this.openEditor(cx))))
      .child(div().flex_1())
      .child(this.button(t, "review-prev-hunk", icon("arrow-up", 12), () => this.jumpHunk(-1)))
      .child(this.button(t, "review-next-hunk", icon("arrow-down", 12), () => this.jumpHunk(1)))
      .when(Boolean(view.newLines), (el) => el.child(this.button(t, "review-full", "Full file", () => this.toggleFull(), { on: view.folds === "all" })))
      .when(view.rows.length > 0, (el) => el.child(this.button(t, "review-ask", "Ask", () => this.askAbout(null))))
      .child(this.button(t, "review-viewed", seen ? icon("check", 12) : "", () => this.toggleViewed(file), { on: seen, title: "Viewed" }))
      .when(st.split && !this.splitShown(), (el) => el.child(div().text_size(11).text_color(t.dim).child("too narrow to split")));
  }

  diff(t) {
    const view = this.view;
    const area = div().id("review-diff-area").flex_1().min_h(0).relative().on_size_change((size, cx) => {
      const zoom = settings().zoom || 1;
      const [width, height] = [size.width / zoom, size.height / zoom];
      if (Math.abs(width - this.width) < 1 && Math.abs(height - this.height) < 1) return;
      this.width = width;
      this.height = height;
      cx.notify();
    });
    this.stack = null;
    if (!view) {
      const text = this.problem ? "" : this.loading ? "Loading…" : this.files.length ? "Loading the diff…" : "";
      return area.child(div().p(12).text_color(t.dim).child(text));
    }
    const file = view.file;
    const split = this.splitShown();
    // What sits between the lines: the comments under their last line, the comment box under
    // the selected lines; whole-file comments, and those whose lines left the diff, on top.
    const notes = this.store().comments.filter((c) => c.path === view.path);
    const spans = new Map(notes.map((c) => [c.id, c.whole ? null : commentSpan(view.rows, c)]));
    const compose = this.compose?.path === view.path ? this.compose : null;
    const top = [];
    const after = new Map();
    const put = (row, extra) => {
      const line = split ? view.pairOf[row] : row;
      after.set(line, [...(after.get(line) || []), extra]);
    };
    for (const c of notes.filter((c) => c.whole).concat(notes.filter((c) => !c.whole))) {
      if (compose?.editing === c.id) continue; // the box takes its place
      const extra = { card: c, h: this.cardHeight(c.text) };
      if (spans.get(c.id)) put(spans.get(c.id)[1], extra);
      else top.push(extra);
    }
    const range = compose && !compose.whole ? this.selRange() : null;
    if (compose) {
      if (range) put(range[1], { composer: true, h: COMPOSER });
      else top.push({ composer: true, h: COMPOSER });
    }
    if (!view.rows.length) {
      const text = view.patch.binary || file.binary ? "Binary file: no text diff" : file.status === "R" ? "Renamed, no other change" : "No text diff";
      return area.child(v_flex().size_full().font_family(palette(t).font).text_size(12).children(top.map((extra) => this.extra(t, extra))).child(div().p(12).text_color(t.dim).child(text)));
    }
    const p = palette(t);
    const zoom = settings().zoom || 1;
    const across = sideways(view, this.width, split, !this.wide);
    this.x = Math.max(0, Math.min(this.x, across.max));
    const [a, b] = range || [-1, -2];
    const marks = {
      selected: (index) => index >= a && index <= b,
      commented: (index) => notes.some((c) => spans.get(c.id) && index >= spans.get(c.id)[0] && index <= spans.get(c.id)[1]),
      foldable: Boolean(view.newLines),
      x: this.x,
      compact: !this.wide,
    };
    const count = split ? view.pairs.length : view.rows.length;
    const stack = (this.stack = stackItems(count, ROW, top, after));
    const maxY = Math.max(0, stack.total - this.height);
    if (this.reveal) {
      this.reveal = false;
      const at = stack.items.findIndex((item) => item.extra?.composer);
      if (at >= 0) this.y = Math.min(stack.tops[at], Math.max(this.y, stack.tops[at] + COMPOSER - this.height));
    }
    this.y = Math.max(0, Math.min(this.y, maxY));
    const draw = split ? (i) => splitRow(p, view, view.pairs[i], marks) : (i) => unifiedRow(p, view, i, marks);
    // Only the items in view are built.
    const first = firstShown(stack.tops, this.y);
    const shown = [];
    for (let i = first; i < stack.items.length && stack.tops[i] < this.y + this.height; i++) {
      const item = stack.items[i];
      if (item.extra) {
        shown.push(this.extra(t, item.extra));
        continue;
      }
      const line = item.line;
      shown.push(
        draw(line).id(`review-row-${line}`).cursor_pointer()
          .on_click((_e, cx) => this.clickRow(line, cx))
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.askRow(line); }),
      );
    }
    // A bar: `along` the axis, its track from `start` and `room` long, for `max` px of scrolling.
    const bar = (axis, start, room, max) => {
      const size = Math.max(24, (room * room) / (room + max));
      const at = start + ((room - size) * this[axis]) / Math.max(1, max);
      const held = this.drag?.axis === axis;
      return div()
        .id(`review-${axis}-bar`)
        .absolute()
        .when(axis === "x", (el) => el.top(0).left(at).w(size).h(10).py(3))
        .when(axis === "y", (el) => el.right(2).top(at).h(size).w(10).px(3))
        .cursor_pointer()
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          // A pointer move along the track moves the view this much more.
          this.drag = { axis, from: e.position[axis], start: this[axis], scale: max / Math.max(1, room - size) };
        })
        .child(div().size_full().rounded(2).bg(t.muted).opacity(held ? 0.9 : 0.45).hover((s) => s.opacity(0.9)));
    };
    // The sideways bar has its own strip under the rows (an absolute bar at the area's bottom was
    // clipped), under the text: the right half's, side by side.
    const textStart = across.gutter + (split ? across.room + across.gutter + 1 : 0);
    const strip = div().relative().h(10).flex_none().w_full().when(across.max > 0, (el) => el.child(bar("x", textStart, across.room, across.max)));
    const box = area
      .font_family(p.font)
      .text_size(12)
      .overflow_hidden()
      .on_scroll_wheel((event, cx) => {
        let dx = event.delta.x / zoom;
        let dy = event.delta.y / zoom;
        // Shift turns the wheel sideways.
        if (event.modifiers.shift && !dx) [dx, dy] = [dy, 0];
        this.x = Math.max(0, Math.min(across.max, this.x - dx));
        this.y = Math.max(0, Math.min(maxY, this.y - dy));
        cx.stop_propagation();
        cx.notify();
      })
      .child(v_flex().absolute().left(0).right(0).top(stack.tops[first] - this.y).children(shown))
      .when(maxY > 0, (el) => el.child(bar("y", 0, this.height, maxY)));
    return v_flex().flex_1().min_h(0).child(box).child(strip);
  }

  // shortcut: a card's height is guessed from its text (wrapped at the diff's width in code
  // characters) and the rest is cut off; measure the text if cards come out wrong.
  cardHeight(text) {
    const perLine = Math.max(20, Math.floor((this.width - 46) / CHAR));
    const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
    return 46 + lines * 17;
  }

  extra(t, extra) {
    return extra.composer ? this.composer(t, extra.h) : this.card(t, extra.card, extra.h);
  }

  card(t, c, h) {
    const what = c.whole ? "the whole file" : spanText(c);
    return div().id(`review-card-${c.id}`).w_full().h(h).flex_none().px(10).py(4).child(
      v_flex().size_full().overflow_hidden().px(10).py(6).gap(4).rounded(8).border_1().border_color(t.border).bg(t.surface).cursor_pointer()
        .hover((s) => s.border_color(t.accent))
        .on_click((_e, cx) => this.editComment(c, cx))
        .child(
          h_flex().gap(6).items_center().text_size(11).text_color(t.dim)
            .child(div().flex_1().min_w(0).truncate().child(`Comment · ${what} · click to edit`))
            .child(div().id(`review-card-x-${c.id}`).text_color(t.dim).hover((s) => s.text_color(t.foreground))
              .on_click((_e, cx) => { cx.stop_propagation(); this.deleteComment(c.id, cx); })
              .child(icon("close", 12))),
        )
        .child(div().whitespace_normal().text_color(t.foreground).child(c.text)),
    );
  }

  /** The comment box, inline under its lines (on top for the whole file). */
  composer(t, h) {
    const c = this.compose;
    const at = c.whole ? null : linesOf(this.selectedRows());
    const what = c.whole ? "the whole file" : at ? spanText(at) : "lines no longer in the diff";
    const ready = Boolean(this.note.value().trim());
    return div().id("review-composer").w_full().h(h).flex_none().px(10).py(4).on_mouse_down("left", stop).child(
      v_flex().size_full().p(8).gap(6).rounded(8).border_1().border_color(t.accent).bg(t.surface)
        .child(div().text_size(11).text_color(t.dim).truncate().child(`${c.editing ? "Edit comment" : "Comment"} · ${what}${c.whole ? "" : " · click lines to widen"}`))
        .child(
          div().id("review-note").flex_1().min_h(0).overflow_hidden().rounded(6).border_1().border_color(this.typing === "note" ? t.accent : t.border).bg(t.background).px(6).py(4).cursor_text()
            .child(Textarea.new(this.note).w_full().text_size(12)),
        )
        .child(
          h_flex().gap(6).items_center()
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child("Enter adds · shift-enter: new line · Esc cancels"))
            .when(Boolean(c.editing), (el) => el.child(this.button(t, "review-note-delete", "Delete", (cx) => this.deleteComment(c.editing, cx))))
            .child(this.button(t, "review-note-cancel", "Cancel", (cx) => this.closeComposer(cx)))
            .child(
              div().id("review-note-add").h(24).px(10).flex().items_center().rounded(6).text_size(12)
                .bg(ready ? t.solid : t.raised).text_color(ready ? t.solid_foreground : t.dim)
                .when(ready, (el) => el.cursor_pointer())
                .on_click((_e, cx) => this.addComment(cx))
                .child(c.editing ? "Save" : "Add comment"),
            ),
        ),
    );
  }

  submitBar(t) {
    const n = this.store().comments.length;
    if (!n) return div();
    return h_flex().flex_none().h(40).px(10).gap(6).items_center().border_t(1).border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(`${n} draft comment${n === 1 ? "" : "s"}`))
      .child(
        div().id("review-submit").h(26).px(10).flex().items_center().rounded(6).text_size(12).cursor_pointer()
          .bg(t.solid).text_color(t.solid_foreground).hover((s) => s.opacity(0.88))
          .on_mouse_down("left", stop)
          .on_click(() => this.submitReview())
          .child(`Submit review · ${n}`),
      );
  }

  commitBox(t) {
    const ready = Boolean(this.repo && !this.busy && !this.loading && this.files.length);
    return h_flex()
      .flex_none()
      .p(8)
      .gap(6)
      .border_t(1)
      .border_color(t.border)
      .child(
        div().id("review-commit-message").flex_1().min_w(0).h(30).px(8).flex().items_center().rounded(7).border_1()
          .border_color(this.typing === "commit" ? t.accent : t.border).cursor_text()
          .on_mouse_down("left", stop)
          .child(Input.new(this.commitInput).h_full().text_size(12).text_color(t.foreground)),
      )
      .child(
        div().id("review-commit").h(30).px(12).flex().items_center().rounded(7).text_size(12)
          .bg(ready ? t.solid : t.raised).text_color(ready ? t.solid_foreground : t.dim)
          .when(ready, (el) => el.cursor_pointer())
          .on_click((_e, cx) => this.commit(cx))
          .child(this.busy ? "Committing…" : "Commit"),
      );
  }
}
