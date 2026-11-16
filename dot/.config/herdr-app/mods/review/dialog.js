// The send dialog: the review mod opened as a dialog of itself (main.js hands the
// copy over to this class when props().dialog is set):
//   openOverlay({ mod: "review", kind: "dialog", props: { dialog: "review" | "ask", title, context, clear? } })
// `context` is the text the agent gets, shown read-only; the person's note goes
// before it. It goes to an agent of the focused space, picked in a dropdown
// (agent.js), or, with none, starts one in a new tab. `clear`: { key, ids }, the
// comments to drop from shared(key) once it went out (a submitted review).

import { div, svg } from "gpui-kit";
import { Editor, EditorState, Popover, Textarea, TextareaState, h_flex, v_flex } from "gpui-base";
import { closeOverlay, notify, props, setShared, settings, shared, theme } from "herdr";
import { defaultAgent, focusedSpace, giveAgent, spaceAgents, startAgent } from "./agent.js";

const name = (agent) => agent.program?.name || agent.app || agent.title || agent.address;
// An unnamed tab is named by its position.
const tabName = (agent) => (/^\d+$/.test(agent.tab_name) ? `tab ${agent.tab_name}` : agent.tab_name);

export class Dialog {
  init(_props, cx) {
    const p = props() || {};
    this.ask = p.dialog === "ask";
    this.title = String(p.title || "");
    this.context = String(p.context || "");
    this.pick = null; // the address picked, else the default
    this.error = null;
    this.confirm = false; // a blocked agent: the next Send forces
    this.choosing = false;
    this.sending = false;
    this.closed = false;
    this.note = TextareaState.new({ placeholder: this.ask ? "What do you want to ask?" : "A note before the review (optional)…", rows: 3 });
    this.note.on("change", (_e, cx) => { this.error = null; this.confirm = false; cx.notify(); });
    // Enter sends; shift-enter is the textarea's own new line.
    this.note.on("submit", (e, cx) => { if (!e?.shift) this.send(cx); });
    this.view = EditorState.new({ value: this.context, readonly: true, line_numbers: false, folding: false, font_family: settings().font_family || "JetBrains Mono", font_size: 12 });
    this.note.focus();
    cx.timer.after(300, () => this.note.focus());
  }

  close() {
    this.closed = true;
    closeOverlay(props().overlay);
  }

  target(list) {
    return list.find((agent) => agent.address === this.pick) || defaultAgent(list);
  }

  text() {
    return [this.note.value().trim(), this.context.trim()].filter(Boolean).join("\n\n");
  }

  done(title, body) {
    const clear = props().clear;
    if (clear) {
      const st = shared(clear.key) || {};
      setShared(clear.key, { ...st, comments: (st.comments || []).filter((c) => !clear.ids.includes(c.id)) });
    }
    notify({ title, body: body || this.title, level: "success" });
    this.close();
  }

  send(cx) {
    const text = this.text();
    if (this.sending) return;
    if (!text || (this.ask && !this.note.value().trim())) { this.error = "Type your question first"; cx.notify(); return; }
    const agent = this.target(spaceAgents());
    const space = focusedSpace();
    if (!agent && !space) { this.error = "No space is shown"; cx.notify(); return; }
    const blocked = agent?.status === "blocked" && agent.app !== "pi";
    if (blocked && !this.confirm) { this.confirm = true; cx.notify(); return; }
    this.sending = true;
    this.error = null;
    cx.spawn(async (cx) => {
      try {
        if (!agent) {
          const started = await startAgent(space, text);
          if (!this.closed) this.done(`Started ${started} with it`);
        } else {
          await giveAgent(agent, text, blocked);
          this.done(agent.app === "pi" ? "In Pi's input" : `Sent to ${name(agent)}`, agent.app === "pi" ? "Read it there and send it." : null);
        }
      } catch (e) {
        // The text stays: fix the cause, then send again.
        this.error = String(e?.message || e).trim().slice(0, 300) || "Could not send";
        this.confirm = false;
      } finally {
        this.sending = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const list = spaceAgents();
    const agent = this.target(list);
    const dot = (a) => div().size(7).flex_none().rounded(4).bg(t[a.status] || t.unknown);
    const label = (a) => h_flex().gap(7).items_center().child(dot(a)).child(div().text_size(12).child(`${name(a)} · ${tabName(a)}`)).child(div().text_size(11).text_color(t.dim).child(a.status));
    const box = h_flex().id("review-to").h(28).px(9).gap(7).items_center().rounded(7).border_1().border_color(this.choosing ? t.accent : t.input).bg(t.raised)
      .when(list.length > 1, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).child(label(agent)).child(svg("mods/review/icons/chevron-down.svg").size(12).text_color(t.dim)))
      .when(list.length <= 1, (el) => el.when(Boolean(agent), (el) => el.child(label(agent))));
    const to = !agent
      ? div().text_size(12).text_color(t.muted).child(`No agent in this space: Send starts the most-used installed agent ${focusedSpace()?.machine ? `on ${focusedSpace().machine}` : "on this machine"} in a new tab.`)
      : h_flex().gap(8).items_center().child(div().text_size(12).text_color(t.dim).child("To")).child(
          list.length < 2
            ? box
            : Popover.new("review-to-list").open(this.choosing).on_open_change((open, cx) => { this.choosing = open; cx.notify(); })
                .trigger(box)
                .content(v_flex().mt(4).min_w(280).p(4).rounded(8).border_1().border_color(t.border).bg(t.popover).shadow_md().children(list.map((a) =>
                  h_flex().id(`review-to-${a.address}`).h(28).px(8).gap(7).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
                    .on_click((_e, cx) => { this.pick = a.address; this.confirm = false; this.choosing = false; cx.notify(); })
                    .child(div().flex_1().child(label(a)))
                    .child(a.address === agent.address ? svg("mods/review/icons/check.svg").size(12).text_color(t.accent) : div().w(12))))),
        );
    const lines = this.context ? this.context.split("\n").length : 0;
    const button = (id, text, primary, action) => div().id(id).h(30).px(14).flex().items_center().rounded(7).text_size(12)
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .when(this.sending && primary, (el) => el.opacity(0.5))
      .when(!(this.sending && primary), (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)))
      .on_click(action).child(text);
    return v_flex().id("review-dialog").size_full().min_h(0).p(16).gap(10).bg(t.popover).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "enter" && (e.modifiers.control || e.modifiers.platform)) { cx.stop_propagation(); this.send(cx); } })
      .child(h_flex().gap(8).items_center()
        .child(div().text_size(15).font_semibold().child(this.ask ? "Ask the agent" : "Submit review"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(this.title))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(to)
      .child(div().rounded(8).border_1().border_color(t.input).bg(t.background).px(8).py(6).child(Textarea.new(this.note).w_full().text_size(12)))
      .when(lines > 0, (el) => el
        .child(div().text_size(11).text_color(t.dim).child(`Sent after your note · ${lines} lines · read-only`))
        .child(div().flex_1().min_h(80).rounded(8).border_1().border_color(t.border).overflow_hidden().child(Editor.new(this.view).size_full())))
      .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.ansi1).child(this.error)))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(this.confirm ? t.blocked : t.dim)
          .child(this.confirm ? `${name(agent)} is blocked: Send again to type it anyway (it may answer its question).` : "Enter or ctrl-enter sends · shift-enter: new line"))
        .child(button("review-dialog-cancel", "Cancel", false, () => this.close()))
        .child(button("review-dialog-send", this.sending ? "Sending…" : !agent ? "Start agent" : this.confirm ? "Send anyway" : "Send", true, (_e, cx) => this.send(cx))));
  }
}
