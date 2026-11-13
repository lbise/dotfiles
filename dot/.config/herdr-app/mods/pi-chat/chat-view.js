// The chat: header, conversation, question, reply box and status bar of the Pi
// the focused tab runs. It reads that Pi's feed while it shows, and sends what
// the person writes and picks.

import { div } from "gpui-kit";
import { Popup, h_flex, v_flex } from "gpui-base";
import { nextCommand, setShared, settings, shared, theme } from "herdr";
import { chatSettings } from "./model/settings.js";
import { AskCard } from "./ask.js";
import { Composer } from "./composer.js";
import { feedFor, feedLive, feedSilent, readFeed, sendCommand } from "./feeds.js";
import { followFocus } from "./follow.js";
import { HEADER_HEIGHT, headerButton, piHeader } from "./header.js";
import { applyLook } from "./look.js";
import { SENT_KEY, conversationRows } from "./rows.js";
import { SettingsPanel } from "./settings-panel.js";
import { emptyChat, noExtension, silentMachine } from "./states.js";
import { statusBar } from "./statusbar.js";
import { viewSwitch } from "./switch.js";
import { Timeline } from "./timeline.js";
import { drawRow } from "./turn.js";
import { icon } from "./ui.js";
import { chooseView, shownView, target } from "./view.js";

const SETTINGS = "pi-chat.settings";
const TICK = 250;
const READ_LIVE = 250;
const READ_IDLE = 2000;
const HURRY = 4000; // after a command, read fast until its effect shows
const SENT_FOR = 60000;
const COPIED_FOR = 1500;
const GROW_AFTER = 30;

export class ChatView {
  constructor(cx) {
    this.timeline = new Timeline();
    this.composer = new Composer(this);
    this.ask = new AskCard((command, cx) => this.command(command, cx), cx);
    this.panel = new SettingsPanel((change, cx) => this.changeLook(change, cx));
    this.panelOpen = false;
    this.panelClosedAt = 0;
    this.width = 0; // of the whole chat, design px
    this.session = ""; // the session on screen
    this.drafted = ""; // the session whose draft is in the reply box
    this.shown = ""; // the session on screen at the last tick; "" while the chat is hidden
    this.drafts = new Map();
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
      hovered: null,
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
    const pi = target();
    const shown = Boolean(pi) && shownView() === "chat";
    if (shown && this.shown !== pi.key) this.arrive(pi);
    this.shown = shown ? pi.key : "";
    if (!shown) return;
    const feed = feedFor(pi);
    if (this.sent && Date.now() - this.sent.at > SENT_FOR) {
      this.sent = null;
      cx.notify();
    }
    const fast = feed.chat.live || Date.now() < this.hurryUntil;
    if (!feed.busy && Date.now() - feed.readAt >= (fast ? READ_LIVE : READ_IDLE)) this.read(feed, cx);
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

  // Another session shows: nothing open, the newest message. Safe while drawing.
  show(pi) {
    if (pi.key === this.session) return;
    this.session = pi.key;
    this.timeline.reset();
    this.openTurns.clear();
    this.openSteps.clear();
    this.knownCells = null;
    this.growing.clear();
    this.sent = null;
    this.notice = "";
  }

  // The chat comes on screen, or shows another session: that session's draft is
  // in the reply box, and the keyboard is where the person will type.
  arrive(pi) {
    if (pi.key !== this.drafted) {
      const draft = this.composer.text();
      if (draft) this.drafts.set(this.drafted, draft);
      else this.drafts.delete(this.drafted);
      this.drafted = pi.key;
      this.composer.set(this.drafts.get(pi.key) || "");
    }
    const state = feedFor(pi).chat.state;
    this.ask.show(state ? state.ask : null);
    if (state && state.ask) this.ask.focus();
    else this.composer.focus();
  }

  // ---- what the person does ----

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
        if (this.session === pi.key && !this.composer.text()) this.composer.set(text);
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
      const reopens = !this.panelOpen && Date.now() - this.panelClosedAt < TICK;
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
          .child(this.composer.render(t, state)),
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
    this.show(pi);
    const look = chatSettings(shared(SETTINGS));
    const feed = feedFor(pi);
    const state = feed.chat.state;
    const live = feedLive(feed, pi);
    const openTerminal = () => chooseView(pi, "terminal");
    const header = div()
      .h(HEADER_HEIGHT)
      .flex_none()
      .child(piHeader(t, pi, (live && state.title) || "", [this.settingsButton(t, look), viewSwitch(t, "chat", (mode) => chooseView(pi, mode))]));
    if (!live) {
      const body = feed.reads > 0 ? noExtension(t, feed.chat.problem, openTerminal) : feedSilent(feed) ? silentMachine(t, pi.machine, openTerminal) : div().flex_1();
      return root.child(header).child(body);
    }
    return root.child(header).child(this.conversation(t, look, feed, zoom)).child(this.dock(t, look, pi, feed)).child(statusBar(t, state, this.width));
  }
}
