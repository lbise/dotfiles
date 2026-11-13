// The chat: header, conversation, question, reply box and status bar of the Pi
// the focused tab runs. It reads that Pi's feed while it shows, and sends what
// the person writes and picks, session commands included.

import { div } from "gpui-kit";
import { Popup, h_flex, v_flex } from "gpui-base";
import { nextCommand, setShared, settings, shared, theme } from "herdr";
import { chatSettings } from "./model/settings.js";
import { AskCard } from "./ask.js";
import { CodeViews } from "./code.js";
import { editInNeovim } from "./editor.js";
import { loadImages } from "./images.js";
import { Composer } from "./composer.js";
import { SharedDraft } from "./draft.js";
import { feedFor, feedFree, feedLive, feedSilent, readCommands, readFeed, sendCommand } from "./feeds.js";
import { followFocus } from "./follow.js";
import { HEADER_HEIGHT, headerButton, piHeader } from "./header.js";
import { bindKeys } from "./keys.js";
import { applyLook } from "./look.js";
import { SENT_KEY, conversationRows } from "./rows.js";
import { Picker } from "./picker.js";
import { sessionMenu } from "./session-menu.js";
import { SettingsPanel } from "./settings-panel.js";
import { emptyChat, noExtension, silentMachine } from "./states.js";
import { StatusBar } from "./statusbar.js";
import { viewSwitch } from "./switch.js";
import { Timeline } from "./timeline.js";
import { drawRow } from "./turn.js";
import { icon } from "./ui.js";
import { chooseView, shownView, target } from "./view.js";

const SETTINGS = "pi-chat.settings";
const TICK = 50; // the view follows a tab switch within this
const REOPEN = 250; // a press this soon after a menu closed was the press that closed it
const READ_LIVE = 250;
const READ_IDLE = 2000;
const HURRY = 4000; // after a command, read fast until its effect shows
const SENT_FOR = 60000;
const COPIED_FOR = 1500;
const GROW_AFTER = 30;
const CODE_AFTER = 16; // a code block drawn plain gets its coloured view this soon after

export class ChatView {
  constructor(cx) {
    this.timeline = new Timeline();
    this.code = new CodeViews();
    this.composer = new Composer(this);
    this.draft = new SharedDraft(this.composer);
    this.picker = new Picker(this);
    this.status = new StatusBar();
    this.sessionOpen = false;
    this.sessionClosedAt = 0;
    this.ask = new AskCard((command, cx) => this.command(command, cx), cx);
    this.panel = new SettingsPanel((change, cx) => this.changeLook(change, cx));
    this.panelOpen = false;
    this.panelClosedAt = 0;
    this.width = 0; // of the whole chat, design px
    this.session = ""; // the Pi and Pi session on screen
    this.shown = null; // the Pi on screen at the last tick; null while the chat is hidden
    this.openTurns = new Map(); // turn key -> open; a closed entry was open before
    this.openSteps = new Set();
    this.hoveredCell = null;
    this.knownCells = null; // step ids of the running turn seen so far; null before the first read
    this.growing = new Set(); // cells drawn small now, to scale in on the next draw
    this.sent = null; // { text, at, after }: sent from here at `at`, not in the conversation yet; `after` is when the last turn began
    this.notice = "";
    this.hurryUntil = 0;
    this.second = -1;
    this.pointer = {
      hovered: new Set(),
      copied: null,
      copy: (id, code, cx) => {
        cx.write_to_clipboard(code);
        this.pointer.copied = id;
        cx.notify();
        cx.timer.after(COPIED_FOR, (cx) => {
          if (this.pointer.copied !== id) return;
          this.pointer.copied = null;
          cx.notify();
        });
      },
    };
    bindKeys(cx);
    cx.timer.every(TICK, (cx) => this.tick(cx));
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        const pi = target();
        if (command === "toggle" && pi) chooseView(pi, "terminal");
      }
    });
  }

  // ---- data ----

  tick(cx) {
    followFocus(cx);
    if (this.code.make()) cx.notify();
    loadImages(cx);
    const pi = target();
    const shown = Boolean(pi) && shownView() === "chat";
    if ((shown ? pi.key : "") !== (this.shown ? this.shown.key : "")) {
      if (this.shown) this.leave(this.shown, cx);
      if (shown) this.arrive(pi);
      this.shown = shown ? pi : null;
    }
    if (!shown) return;
    const feed = feedFor(pi);
    if (this.sent && Date.now() - this.sent.at > SENT_FOR) {
      this.sent = null;
      cx.notify();
    }
    const fast = feed.chat.live || (feed.chat.state && feed.chat.state.status === "compacting") || Date.now() < this.hurryUntil;
    if (feedFree(feed) && Date.now() - feed.readAt >= (fast ? READ_LIVE : READ_IDLE)) this.read(feed, cx);
    // The running clock: one redraw a second.
    const second = feed.chat.live ? Math.floor(this.elapsed(feed) / 1000) : -1;
    if (second !== this.second) {
      this.second = second;
      cx.notify();
    }
  }

  read(feed, cx) {
    cx.spawn(async (cx) => {
      if (!(await readFeed(feed))) return;
      this.arrived(feed);
      cx.notify();
      cx.timer.after(CODE_AFTER, (cx) => {
        if (this.code.make()) cx.notify();
      });
      if (!this.growing.size) return;
      cx.timer.after(GROW_AFTER, (cx) => {
        this.growing.clear();
        cx.notify();
      });
    });
  }

  // A read brought something new.
  arrived(feed) {
    const { chat } = feed;
    if (this.shown && feedFor(this.shown) === feed) this.draft.follow(this.shown);
    if (this.sent) {
      const turn = chat.turns.find((entry) => entry.user && entry.user.text === this.sent.text && (entry.startedAt || 0) > this.sent.after);
      if (turn) {
        this.timeline.rename(SENT_KEY, `${turn.key}:user`);
        this.sent = null;
      }
    }
    const asked = this.ask.show(chat.state ? chat.state.ask : null);
    if (asked) this.ask.focus();
    else if (!chat.state || !chat.state.ask) this.answered();
    // Steps the running turn gained since the last read scale in.
    const last = chat.turns[chat.turns.length - 1];
    const ids = last && last.live ? last.steps.map((step) => step.id) : [];
    if (this.knownCells) for (const id of ids) if (!this.knownCells.has(id)) this.growing.add(id);
    this.knownCells = new Set(ids);
  }

  // The question is gone: typing goes to the reply box again.
  answered() {
    if (this.ask.keys.is_focused()) this.composer.focus();
  }

  // How long the running turn has taken: its duration when last read, plus the time since.
  elapsed(feed) {
    const turn = feed.chat.turns[feed.chat.turns.length - 1];
    return turn && turn.live && turn.durationMs !== null ? turn.durationMs + (Date.now() - feed.changedAt) : 0;
  }

  // Another Pi, or another session of it, shows: nothing open, the newest message. Safe while drawing.
  show(pi, chat) {
    const session = `${pi.key}|${chat.epoch}`;
    if (session === this.session) return;
    this.session = session;
    this.picker.kind = null;
    this.sessionOpen = false;
    this.pointer.hovered.clear();
    this.timeline.reset();
    this.openTurns.clear();
    this.openSteps.clear();
    this.knownCells = null;
    this.growing.clear();
    this.sent = null;
    this.notice = "";
  }

  // The chat comes on screen, or shows another Pi: that Pi's draft is in the
  // reply box (a fresh read follows at once), and the keyboard is where the person will type.
  arrive(pi) {
    this.draft.arrive(pi);
    this.hurryUntil = Date.now() + HURRY;
    const state = feedFor(pi).chat.state;
    this.ask.show(state ? state.ask : null);
    if (state && state.ask) this.ask.focus();
    else this.composer.focus();
  }

  // The chat stops showing this Pi: its input box takes the reply box's draft.
  leave(pi, cx) {
    this.picker.kind = null;
    this.draft.leave(pi, cx, (cx) => {
      this.notice = "Pi did not take your draft. It is still in the reply box.";
      cx.notify();
    });
  }

  // ---- what the person does ----

  /** Pi takes no session command now. */
  busy() {
    const pi = target();
    const state = pi ? feedFor(pi).chat.state : null;
    return !state || state.status !== "idle";
  }

  slashCommands() {
    const pi = target();
    return pi ? feedFor(pi).commands : [];
  }

  // commands.json is read each time the slash menu opens; what was read before shows meanwhile.
  loadCommands(cx) {
    const pi = target();
    if (!pi) return;
    cx.spawn(async (cx) => {
      if (await readCommands(feedFor(pi))) cx.notify();
    });
  }

  /**
   * A session command from the slash menu, the reply box or the session menu:
   * new and compact run, resume and tree open their picker. False when Pi is busy.
   */
  runSession(action, instructions, cx) {
    const pi = target();
    if (!pi) return false;
    if (this.busy()) {
      this.notice = "Pi is busy. Session commands wait until it is idle.";
      cx.notify();
      return false;
    }
    if (action === "resume") this.picker.open("sessions", feedFor(pi), cx);
    else if (action === "tree") this.picker.open("tree", feedFor(pi), cx);
    else this.sessionCommand(action === "compact" && instructions ? { type: "session", action, instructions } : { type: "session", action }, cx);
    return true;
  }

  sessionCommand(command, cx) {
    // Going back to a message of yours puts it in Pi's input box: the reply box takes it.
    if (command.action === "tree" && this.shown) this.draft.expect(this.shown, HURRY);
    this.timeline.follow();
    this.command(command, cx);
  }

  /** Ctrl+G: the reply box's text in Neovim over the chat; what Neovim leaves comes back into the box. */
  editDraft(cx) {
    const pi = target();
    if (!pi || this.editing) return;
    this.editing = true;
    const text = this.composer.text();
    cx.spawn(async (cx) => {
      try {
        const edited = await editInNeovim(pi, text);
        if (this.shown && this.shown.key === pi.key) this.composer.set(edited);
      } catch (err) {
        this.notice = `Neovim did not open: ${err instanceof Error ? err.message : err}`;
      } finally {
        this.editing = false;
        this.composer.focus();
        cx.notify();
      }
    });
  }

  /** Every model Pi has credentials for, to pick one or change which ones Ctrl+P cycles through. */
  openModels(cx) {
    const pi = target();
    if (pi) this.picker.open("models", feedFor(pi), cx);
  }

  pickerClosed(cx) {
    this.composer.focus();
    cx.notify();
  }

  toggleSession(cx) {
    // The press that closes the menu also lands on the title: that click must not open it again.
    const reopens = !this.sessionOpen && Date.now() - this.sessionClosedAt < REOPEN;
    this.sessionOpen = !this.sessionOpen && !reopens;
    cx.notify();
  }

  closeSession(cx) {
    if (!this.sessionOpen) return;
    this.sessionOpen = false;
    this.sessionClosedAt = Date.now();
    cx.notify();
  }

  command(command, cx) {
    const pi = target();
    if (!pi) return;
    const feed = feedFor(pi);
    this.hurryUntil = Date.now() + HURRY;
    this.notice = "";
    cx.spawn(async (cx) => {
      try {
        await sendCommand(feed, command);
      } catch {
        this.notice = `${pi.machine || "This computer"} did not take that. Try again.`;
        cx.notify();
      }
    });
  }

  send(text, cx) {
    const pi = target();
    if (!pi) return;
    const feed = feedFor(pi);
    const last = feed.chat.turns[feed.chat.turns.length - 1];
    const sent = { text, at: Date.now(), after: last ? last.startedAt || 0 : 0 };
    this.sent = sent;
    this.notice = "";
    this.hurryUntil = Date.now() + HURRY;
    this.timeline.follow();
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await sendCommand(feed, { type: "prompt", text });
      } catch {
        if (this.sent === sent) this.sent = null;
        if (this.shown && this.shown.key === pi.key && !this.composer.text()) this.composer.set(text);
        this.notice = `Not sent: ${pi.machine || "this computer"} did not take the message. It is back in the box.`;
        cx.notify();
      }
    });
  }

  stop(cx) {
    this.command({ type: "abort" }, cx);
  }

  toggleTurn(key, cx) {
    this.timeline.hold();
    this.openTurns.set(key, this.openTurns.get(key) !== true);
    cx.notify();
  }

  toggleStep(id, cx) {
    this.timeline.hold();
    if (this.openSteps.has(id)) this.openSteps.delete(id);
    else this.openSteps.add(id);
    cx.notify();
  }

  changeLook(change, cx) {
    const look = chatSettings({ ...chatSettings(shared(SETTINGS)), ...change });
    setShared(SETTINGS, look);
    if ("accent" in change || "ground" in change) {
      cx.spawn(async (cx) => {
        try {
          await applyLook(look);
        } catch {
          this.notice = "The colours could not be saved to settings.json.";
          cx.notify();
        }
      });
    }
    cx.notify();
  }

  // ---- drawing ----

  settingsButton(t, look) {
    const button = headerButton(t, "pi-chat-settings", icon("sliders"), "Chat settings", this.panelOpen, (cx) => {
      // The press that closes the panel also lands here: that click must not open it again.
      const reopens = !this.panelOpen && Date.now() - this.panelClosedAt < REOPEN;
      this.panelOpen = !this.panelOpen && !reopens;
      if (this.panelOpen) this.panel.opened(look);
      cx.notify();
    });
    const close = (cx) => {
      this.panelOpen = false;
      this.panelClosedAt = Date.now();
      cx.notify();
    };
    return Popup.new("pi-chat-settings-popup", button)
      .anchor("top_right")
      .when(this.panelOpen, (el) => el.content(this.panel.render(t, look, close)));
  }

  titleMenu(t, state) {
    return sessionMenu(t, {
      title: state.title || "",
      open: this.sessionOpen,
      busy: state.status !== "idle",
      toggle: (cx) => this.toggleSession(cx),
      pick: (action, cx) => {
        this.closeSession(cx);
        this.runSession(action, "", cx);
      },
      close: (cx) => this.closeSession(cx),
    });
  }

  jump(t) {
    return h_flex()
      .absolute()
      .bottom(10)
      .left(0)
      .right(0)
      .justify_center()
      .child(
        div()
          .id("pi-chat-latest")
          .size(32)
          .flex()
          .items_center()
          .justify_center()
          .rounded(16)
          .cursor_pointer()
          .bg(t.surface)
          .border_1()
          .border_color(t.input)
          .shadow_lg()
          .text_color(t.foreground)
          .hover((s) => s.bg(t.raised))
          .tooltip("Jump to latest")
          .accessibility_label("Jump to latest")
          .on_click((_event, cx) => {
            this.timeline.follow();
            cx.notify();
          })
          .child(icon("arrow-down", 16)),
      );
  }

  conversation(t, look, feed, zoom) {
    const items = conversationRows(feed.chat, this.sent);
    if (!items.length) return emptyChat(t);
    const ui = { t, look, width: look.width, elapsed: this.elapsed(feed), asking: feed.chat.state.status === "asking", chat: this };
    const list = this.timeline.render({
      items,
      row: (item) => drawRow(item, ui),
      width: look.width,
      zoom,
      ready: feed.reads > 0,
      thumb: t.border,
    });
    return v_flex().relative().flex_1().min_h(0).child(list).when(this.timeline.away, (el) => el.child(this.jump(t)));
  }

  dock(t, look, pi, feed) {
    const state = feed.chat.state;
    const notice = feedSilent(feed)
      ? `${pi.machine || "This computer"} is not answering. This is the conversation as last read.`
      : this.notice || (state.error ? `Pi's chat extension reports: ${state.error}` : "");
    return h_flex()
      .w_full()
      .flex_none()
      .justify_center()
      .px(24)
      .child(
        v_flex()
          .w_full()
          .max_w(look.width)
          .when(notice, (el) => el.child(div().mt(10).text_size(13).text_color(t.ansi1).child(notice)))
          .when(state.ask, (el) => el.child(this.ask.render(t, state.ask)))
          .child(this.composer.render(t, state, { picker: this.picker.render(t, Math.min(560, this.width - 48)), width: this.width - 48 })),
      );
  }

  render() {
    const t = theme();
    const pi = target();
    const zoom = settings().zoom || 1;
    const root = v_flex()
      .id("pi-chat")
      .on_size_change((size, cx) => {
        const width = size.width / zoom;
        if (Math.abs(width - this.width) < 1) return;
        this.width = width;
        cx.notify();
      })
      .size_full()
      .min_h(0)
      .rounded(10)
      .border_1()
      .border_color(t.border)
      .bg(t.background)
      .overflow_hidden()
      .text_color(t.foreground);
    if (!pi) return root;
    const look = chatSettings(shared(SETTINGS));
    const feed = feedFor(pi);
    const state = feed.chat.state;
    const live = feedLive(feed, pi);
    this.show(pi, feed.chat);
    const openTerminal = () => chooseView(pi, "terminal");
    const header = div()
      .h(HEADER_HEIGHT)
      .flex_none()
      .child(piHeader(t, pi, live ? this.titleMenu(t, state) : "", [this.settingsButton(t, look), viewSwitch(t, "chat", (mode) => chooseView(pi, mode))]));
    if (!live) {
      const body = feed.reads > 0 ? noExtension(t, feed.chat.problem, openTerminal) : feedSilent(feed) ? silentMachine(t, pi.machine, openTerminal) : div().flex_1();
      return root.child(header).child(body);
    }
    return root.child(header).child(this.conversation(t, look, feed, zoom)).child(this.dock(t, look, pi, feed)).child(this.status.render(t, state, zoom));
  }
}
