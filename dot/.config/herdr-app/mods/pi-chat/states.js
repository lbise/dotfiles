// What the chat shows instead of a conversation: nothing sent yet, a Pi without
// the chat extension, a machine that does not answer.

import { div } from "gpui-kit";
import { v_flex } from "gpui-base";

function message(t, title, text, action) {
  return v_flex()
    .flex_1()
    .min_h(0)
    .items_center()
    .justify_center()
    .gap(6)
    .px(24)
    .child(div().max_w(440).text_center().text_size(15).font_medium().text_color(t.foreground).child(title))
    .when(text, (el) => el.child(div().max_w(440).text_center().text_size(13).line_height(1.5).text_color(t.muted).child(text)))
    .when(action, (el) => el.child(action));
}

function button(t, id, label, press) {
  return div()
    .id(id)
    .mt(10)
    .h(30)
    .px(12)
    .flex()
    .items_center()
    .rounded(8)
    .cursor_pointer()
    .bg(t.accent)
    .text_size(13)
    .font_medium()
    .text_color(t.accent_foreground)
    .hover((s) => s.opacity(0.86))
    .on_click((_event, cx) => press(cx))
    .child(label);
}

export function emptyChat(t) {
  return message(t, "Nothing here yet", "Write to Pi below to start.", null);
}

export function noExtension(t, problem, openTerminal) {
  const text =
    problem === "version"
      ? "This Pi's chat extension and this chat are different versions. Update both, then run /reload in Pi."
      : "This Pi is running without the chat extension. Restart it, or run /reload.";
  return message(t, "No chat for this Pi", text, button(t, "pi-chat-open-terminal", "Open Terminal", openTerminal));
}

export function silentMachine(t, machine, openTerminal) {
  const title = `${machine || "This computer"} is not answering`;
  return message(t, title, "The chat fills in when it answers again.", button(t, "pi-chat-open-terminal", "Open Terminal", openTerminal));
}
