// Pi chat: a chat view for Pi coding agents (docs/herdr-chat.md).
// One mod, two places in the layout: the chat itself (props.role "chat"), and the
// header of every terminal pane (Herdr gives those props.pane).

import { View } from "gpui-kit";
import { props } from "herdr";
import { ChatView } from "./chat-view.js";
import { PaneHeader } from "./pane-header.js";

export default class PiChat extends View {
  init(_props, cx) {
    this.part = props()?.pane ? new PaneHeader(cx) : new ChatView(cx);
  }

  render(cx) {
    return this.part.render(cx);
  }
}
