// Review: the changes of the focused pane's repo, to read and comment on.
// It replaces Herdr's Changes panel (layouts/leo.json's `changes` block) and
// opens maximized as a dialog (props.max). The two copies share what is shown
// through shared(`review:<machine>:<repo>`): the mode, base, open file, split,
// viewed marks and comments. See .scratch/herdr-code-review/spec.md.

import { View, div, svg } from "gpui-kit";
import { Input, InputState, Scrollbar, Textarea, TextareaState, h_flex, v_flex } from "gpui-base";
import { checking, closeOverlay, nextCommand, openOverlay, props, setShared, settings, shared, theme, watchFolder } from "herdr";
import { giveAgent, sendLabel, tabAgent } from "./agent.js";
import { ROW, layoutView, makeView, palette, sideways, splitRow, unifiedRow } from "./diffview.js";
import { commentMessage } from "./files.js";
import { EXPAND } from "./patch.js";
import { branches, changedFiles, commitAll, compareFrom, defaultBase, fileDiff, findRepo, location } from "./git.js";

const POLL = 10000;
const SPLIT_MIN = 600; // design px of diff below which side by side is unified
const STEP = 60; // design px an h or l moves the text sideways
const STATUS = { A: "ansi2", D: "ansi1", U: "ansi1", R: "ansi4", M: "blocked" };
const DEFAULTS = { mode: "changes", base: null, open: null, split: false, viewed: {}, comments: [] };

const icon = (name, size = 14) => svg(`mods/review/icons/${name}.svg`).size(size).flex_none();
const stop = (_event, cx) => cx.stop_propagation();

export default class Review extends View {
  init(_props, cx) {
    this.max = Boolean(props()?.max);
    this.handle = cx.focus_handle();
    this.repo = null; // { root, on, branch }
    this.files = [];
    this.view = null; // the open file's diff (diffview.js makeView)
    this.sel = null; // { anchor, head }: rows selected, unified indices
    // The diff scrolls itself: a GPUI list keeps the wheel and cannot scroll sideways.
    this.width = 0; // the diff's, design px
    this.height = 0;
    this.x = 0; // the text scrolled sideways, design px
    this.y = 0; // the rows scrolled down, design px
    this.drag = null; // { axis, from, start, scale }: a scroll bar held at pointer `from`
    this.hunk = -1; // the hunk last jumped to
    this.commitInput = InputState.new({ placeholder: "Commit message" });
    this.commitInput.on("submit", (_e, cx) => this.commit(cx));
    this.note = TextareaState.new({ placeholder: "Comment on the selected lines…", rows: 3 });
    // Which box has the keyboard: "note", "commit" or null.
    for (const [name, state] of [["commit", this.commitInput], ["note", this.note]]) {
      state.on("focus", (_e, cx) => { this.typing = name; cx.notify(); });
      state.on("blur", (_e, cx) => { if (this.typing === name) this.typing = null; cx.notify(); });
    }
    this.note.on("change", (_e, cx) => cx.notify());
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) === "focus") this.handle.focus();
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
    return { ...DEFAULTS, ...((key && shared(key)) || {}) };
  }

  save(change) {
    const key = this.key();
    if (key) setShared(key, { ...this.store(), ...change });
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
      Object.assign(this, { repo: null, files: [], view: null, sel: null, error: null, problem: null, watched: null, limited: false });
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
        this.sel = null;
        this.hunk = -1;
        this.x = 0;
        this.y = 0;
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
    this.picking = [];
    cx.spawn(async (cx) => {
      try { this.picking = await branches(this.repo); } catch (e) { this.picking = null; this.problem = String(e.message || e); }
      cx.notify();
    });
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

  jumpHunk(by) {
    const view = this.view;
    if (!view) return;
    const heads = view.rows.flatMap((row, index) => (row.kind === "hunk" ? [index] : []));
    if (!heads.length) return;
    this.hunk = Math.max(0, Math.min(heads.length - 1, this.hunk + by));
    const row = heads[this.hunk];
    this.y = (this.splitShown() ? view.pairs.findIndex((pair) => pair.left === row) : row) * ROW; // clamped when drawn
  }

  toggleFull() {
    const view = this.view;
    if (!view) return;
    view.folds = view.folds === "all" ? {} : "all";
    layoutView(view);
    this.sel = null;
  }

  splitShown() {
    return this.store().split && (this.width === 0 || this.width >= SPLIT_MIN);
  }

  maximize() {
    if (this.max) closeOverlay(props().overlay);
    else openOverlay({ mod: "review", kind: "dialog", width: 0.96, height: 0.94, props: { max: true } });
  }

  /** A click on a row (a row's index, or a side-by-side pair's). */
  clickRow(key, shift, cx) {
    const view = this.view;
    if (!view) return;
    let index = key;
    if (this.splitShown()) {
      const pair = view.pairs[index];
      if (!pair) return;
      index = pair.right ?? pair.left;
    }
    const row = view.rows[index];
    if (!row) return;
    if (row.kind === "gap") {
      if (!view.newLines || view.folds === "all") return;
      view.folds = { ...view.folds, [row.gap]: (view.folds[row.gap] || 0) + EXPAND };
      layoutView(view);
      this.sel = null;
    } else if (row.kind !== "hunk") {
      const anchor = shift && this.sel ? this.sel.anchor : index;
      const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)];
      // A selection stays inside one hunk.
      const crosses = view.rows.slice(a, b + 1).some((r) => r.kind === "hunk" || r.kind === "gap");
      this.sel = crosses ? { anchor: index, head: index } : { anchor, head: index };
    }
    this.handle.focus();
    cx.notify();
  }

  selectedRows() {
    if (!this.sel || !this.view) return [];
    const [a, b] = [Math.min(this.sel.anchor, this.sel.head), Math.max(this.sel.anchor, this.sel.head)];
    return this.view.rows.slice(a, b + 1);
  }

  addComment(cx) {
    const rows = this.selectedRows();
    const text = this.note.value().trim();
    if (!rows.length || !text) return;
    const side = rows.every((row) => row.kind === "del") ? "old" : "new";
    const numbers = rows.map((row) => (side === "old" ? row.old : row.new)).filter((n) => n !== null);
    const sign = { add: "+", del: "-", same: " " };
    const comment = { path: this.view.path, side, from: Math.min(...numbers), to: Math.max(...numbers), excerpt: rows.map((row) => sign[row.kind] + row.text), text };
    this.save({ comments: [...this.store().comments, comment] });
    this.note.set_value("");
    this.sel = null;
    this.handle.focus();
    cx.notify();
  }

  removeComment(index) {
    this.save({ comments: this.store().comments.filter((_c, i) => i !== index) });
  }

  sendComments(cx) {
    const agent = tabAgent();
    const comments = this.store().comments;
    if (!agent || !comments.length || this.sending) return;
    this.sending = true;
    this.problem = null;
    cx.spawn(async (cx) => {
      try {
        await giveAgent(agent, commentMessage(comments));
        const sent = new Set(comments.map((c) => JSON.stringify(c)));
        this.save({ comments: this.store().comments.filter((c) => !sent.has(JSON.stringify(c))) });
        this.notice = agent.app === "pi" ? "In Pi's input: read it there and send it." : `Sent to ${agent.app || "the agent"}.`;
      } catch (e) {
        this.problem = `Could not send: ${e.message || e}`;
      } finally {
        this.sending = false;
        cx.notify();
      }
    });
    cx.notify();
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
      if (this.typing) { this.typing = null; this.handle.focus(); cx.stop_propagation(); cx.notify(); return; }
      if (this.sel || this.picking) { this.sel = null; this.picking = null; cx.stop_propagation(); cx.notify(); }
      return;
    }
    if (this.typing || e.modifiers.control || e.modifiers.alt || e.modifiers.platform) return;
    const actions = {
      j: () => this.step(1, cx),
      k: () => this.step(-1, cx),
      n: () => this.jumpHunk(1),
      p: () => this.jumpHunk(-1),
      u: () => this.nextUnviewed(cx),
      v: () => { const file = this.files.find((f) => f.path === this.current()); if (file) this.toggleViewed(file); },
      s: () => this.save({ split: !this.store().split }),
      f: () => this.toggleFull(),
      m: () => this.maximize(),
      r: () => this.refresh(cx, true),
      h: () => { this.x = Math.max(0, this.x - STEP); },
      l: () => { this.x += STEP; }, // clamped when drawn
      c: () => { if (this.sel) this.note.focus(); },
    };
    const action = actions[e.key];
    if (!action) return;
    action();
    cx.stop_propagation();
    cx.notify();
  }

  // ---- drawing

  render(cx) {
    if (JSON.stringify(location()) !== this.context) this.refresh(cx);
    const t = theme();
    const st = this.store();
    // Another copy (the dialog, the panel) picked another file or mode.
    if (this.repo && !this.loading && this.compared !== undefined && this.compared !== `${st.mode}|${st.base}`) this.refresh(cx);
    else if (this.view && this.current() && this.view.path !== this.current() && this.wanted !== this.current() && !this.loading) this.show(this.current(), cx);
    const body = this.max
      ? h_flex()
          .flex_1()
          .min_h(0)
          .items_start()
          .child(v_flex().w(320).h_full().flex_none().border_r(1).border_color(t.border).child(this.fileList(t, true)).child(this.commentsPanel(t)).when(st.mode === "changes", (el) => el.child(this.commitBox(t))))
          .child(v_flex().flex_1().min_w(0).h_full().child(this.fileHeader(t)).child(this.diff(t)).child(this.composer(t)))
      : v_flex()
          .flex_1()
          .min_h(0)
          .child(this.fileList(t, false))
          .child(this.fileHeader(t))
          .child(this.diff(t))
          .child(this.composer(t))
          .child(this.commentsPanel(t))
          .when(st.mode === "changes", (el) => el.child(this.commitBox(t)));
    return v_flex()
      .id("review")
      .size_full()
      .min_h(0)
      .when(!this.max, (el) => el.rounded(10).border_1().border_color(t.border))
      .overflow_hidden()
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
      .child(body);
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
      .child(this.button(t, "review-max", icon(this.max ? "unzoom" : "zoom"), () => this.maximize()));
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
      .p(4)
      .border_b(1)
      .border_color(t.border)
      .bg(t.surface)
      .when(!this.picking.length, (el) => el.child(div().p(6).text_color(t.dim).child("Loading branches…")))
      .children(
        this.picking.map((name) =>
          div().id(`review-base-${name}`).h(24).px(8).flex().items_center().rounded(5).cursor_pointer().text_size(12)
            .when(name === st.base, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.setBase(name, cx))
            .child(name),
        ),
      );
  }

  fileList(t, tall) {
    const current = this.current();
    const comments = this.store().comments;
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
            .when(notes > 0, (el) => el.child(div().text_size(11).text_color(t.accent).child(`●${notes}`)))
            .when(f.binary, (el) => el.child(div().text_size(11).text_color(t.dim).child("bin")))
            .when(f.add > 0, (el) => el.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`)))
            .when(f.del > 0, (el) => el.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
        }),
      )
      .when(!this.files.length, (el) =>
        el.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.repo ? "No changes" : "No folder"))),
      )
      .when(this.limited, (el) => el.child(div().p(8).text_size(11).text_color(t.dim).child("Showing the first 1,000 files")));
    return div()
      .relative()
      .when(tall, (el) => el.flex_1().min_h(80))
      .when(!tall, (el) => el.flex_none().h(Math.min(240, Math.max(40, this.files.length * 26 + 10))).border_b(1).border_color(t.border))
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
      .child(div().flex_1().min_w(0).truncate().text_size(12).child(file.old !== file.path ? `${file.old} → ${file.path}` : file.path))
      .child(this.button(t, "review-prev-hunk", icon("arrow-up", 12), () => this.jumpHunk(-1)))
      .child(this.button(t, "review-next-hunk", icon("arrow-down", 12), () => this.jumpHunk(1)))
      .when(Boolean(view.newLines), (el) => el.child(this.button(t, "review-full", "Full file", () => this.toggleFull(), { on: view.folds === "all" })))
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
    if (!view) {
      const text = this.problem ? "" : this.loading ? "Loading…" : this.files.length ? "Loading the diff…" : "";
      return area.child(div().p(12).text_color(t.dim).child(text));
    }
    const file = view.file;
    if (!view.rows.length) {
      const text = view.patch.binary || file.binary ? "Binary file: no text diff" : file.status === "R" ? "Renamed, no other change" : "No text diff";
      return area.child(div().p(12).text_color(t.dim).child(text));
    }
    const split = this.splitShown();
    const p = palette(t);
    const zoom = settings().zoom || 1;
    const across = sideways(view, this.width, split, !this.max);
    this.x = Math.max(0, Math.min(this.x, across.max));
    const [a, b] = this.sel ? [Math.min(this.sel.anchor, this.sel.head), Math.max(this.sel.anchor, this.sel.head)] : [-1, -2];
    const store = this.store();
    const notes = store.comments.filter((c) => c.path === view.path);
    const marks = {
      selected: (index) => index >= a && index <= b,
      commented: (index) => {
        const row = view.rows[index];
        return notes.some((c) => (c.side === "old" ? row.kind === "del" && row.old >= c.from && row.old <= c.to : row.new !== null && row.new >= c.from && row.new <= c.to));
      },
      foldable: Boolean(view.newLines),
      x: this.x,
      compact: !this.max,
    };
    const count = split ? view.pairs.length : view.rows.length;
    const maxY = Math.max(0, count * ROW - this.height);
    this.y = Math.max(0, Math.min(this.y, maxY));
    const draw = split ? (i) => splitRow(p, view, view.pairs[i], marks) : (i) => unifiedRow(p, view, i, marks);
    // Only the rows in view are built.
    const first = Math.floor(this.y / ROW);
    const last = Math.min(count, Math.ceil((this.y + this.height) / ROW) + 1);
    const rows = [];
    for (let i = first; i < last; i++)
      rows.push(draw(i).id(`review-row-${i}`).on_click((e, cx) => this.clickRow(i, e.modifiers.shift, cx)));
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
      .child(v_flex().absolute().left(0).right(0).top(first * ROW - this.y).children(rows))
      .when(maxY > 0, (el) => el.child(bar("y", 0, this.height, maxY)));
    return v_flex().flex_1().min_h(0).child(box).child(strip);
  }

  composer(t) {
    const rows = this.selectedRows();
    if (!rows.length) return div();
    const side = rows.every((row) => row.kind === "del") ? "old" : "new";
    const numbers = rows.map((row) => (side === "old" ? row.old : row.new)).filter((n) => n !== null);
    const lines = numbers.length ? (Math.min(...numbers) === Math.max(...numbers) ? `line ${numbers[0]}` : `lines ${Math.min(...numbers)}–${Math.max(...numbers)}`) : "";
    const ready = Boolean(this.note.value().trim());
    return v_flex()
      .flex_none()
      .p(8)
      .gap(6)
      .border_t(1)
      .border_color(t.border)
      .bg(t.chrome)
      .child(div().text_size(11).text_color(t.dim).child(`Comment on ${this.view.path}, ${lines}${side === "old" ? " (removed)" : ""} · shift-click to extend`))
      .child(
        div().id("review-note").rounded(6).border_1().border_color(this.typing === "note" ? t.accent : t.border).p(4).cursor_text()
          .on_mouse_down("left", stop)
          .child(Textarea.new(this.note).w_full().text_size(12)),
      )
      .child(
        h_flex().gap(6).justify_end()
          .child(this.button(t, "review-note-cancel", "Cancel", (cx) => { this.sel = null; this.note.set_value(""); this.handle.focus(); cx.notify(); }))
          .child(
            div().id("review-note-add").h(24).px(10).flex().items_center().rounded(6).text_size(12)
              .bg(ready ? t.solid : t.raised).text_color(ready ? t.solid_foreground : t.dim)
              .when(ready, (el) => el.cursor_pointer())
              .on_mouse_down("left", stop)
              .on_click((_e, cx) => this.addComment(cx))
              .child("Add comment"),
          ),
      );
  }

  commentsPanel(t) {
    const comments = this.store().comments;
    if (!comments.length) return div();
    const agent = tabAgent();
    const can = Boolean(agent) && !this.sending;
    return v_flex()
      .flex_none()
      .max_h(200)
      .border_t(1)
      .border_color(t.border)
      .child(
        h_flex().h(30).px(10).gap(6).items_center()
          .child(div().flex_1().text_size(12).font_semibold().child(`Comments · ${comments.length}`))
          .child(
            div().id("review-send").h(24).px(10).flex().items_center().rounded(6).text_size(12)
              .bg(can ? t.solid : t.raised).text_color(can ? t.solid_foreground : t.dim)
              .when(can, (el) => el.cursor_pointer())
              .on_mouse_down("left", stop)
              .on_click((_e, cx) => this.sendComments(cx))
              .child(this.sending ? "Sending…" : sendLabel(agent)),
          ),
      )
      .child(
        v_flex().id("review-comments").flex_1().min_h(0).overflow_y_scroll().px(6).pb(6).children(
          comments.map((c, index) =>
            h_flex().id(`review-comment-${index}`).gap(6).px(4).py(3).items_start().rounded(5).cursor_pointer().hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => this.open(c.path, cx))
              .child(div().flex_none().text_size(11).text_color(t.accent).child(`${c.path.split("/").pop()}:${c.from}${c.to !== c.from ? `-${c.to}` : ""}`))
              .child(div().flex_1().min_w(0).text_size(12).truncate().child(c.text))
              .child(div().id(`review-comment-x-${index}`).flex_none().text_color(t.dim).hover((s) => s.text_color(t.foreground))
                .on_click((_e, cx) => { cx.stop_propagation(); this.removeComment(index); cx.notify(); })
                .child(icon("close", 12))),
          ),
        ),
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
