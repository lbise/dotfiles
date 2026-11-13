// The session's title in the chat header, and the menu it opens: start a new
// session, resume another, go back in the tree, compact, reload.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { menu } from "./menu.js";
import { icon } from "./ui.js";

const ITEMS = [
  { key: "new", text: "New session", glyph: "plus", note: "/new" },
  { key: "resume", text: "Resume…", glyph: "history", note: "/resume" },
  { key: "tree", text: "Tree…", glyph: "branch", note: "/tree" },
  { key: "compact", text: "Compact", glyph: "compact", note: "/compact" },
  { key: "reload", text: "Reload", glyph: "refresh", note: "/reload" },
];

/**
 * @param {Record<string, string>} t The theme.
 * @param {{ title: string, open: boolean, busy: boolean, toggle: (cx: object) => void, pick: (action: string, cx: object) => void, close: (cx: object) => void }} options
 *   `busy`: Pi is not idle, and takes no session command.
 */
export function sessionMenu(t, { title, open, busy, toggle, pick, close }) {
  const trigger = h_flex()
    .id("pi-chat-session")
    .h(26)
    .min_w(0)
    .px(6)
    .ml(-4)
    .gap(4)
    .items_center()
    .rounded(7)
    .cursor_pointer()
    .when(open, (el) => el.bg(t.surface))
    .hover((s) => s.bg(t.surface))
    .on_click((_event, cx) => toggle(cx))
    .child(div().min_w(0).truncate().font_medium().text_color(title ? t.foreground : t.muted).child(title || "Session"))
    .child(div().flex_none().text_color(t.muted).child(icon("chevron-down", 13)));
  return menu(t, {
    id: "pi-chat-session-menu",
    trigger,
    open,
    below: true,
    width: 220,
    items: ITEMS.map((item) => ({ ...item, off: busy })),
    pick,
    close,
  }).flex_shrink(1).min_w(0);
}
