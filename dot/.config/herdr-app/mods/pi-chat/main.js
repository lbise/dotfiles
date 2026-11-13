// Pi chat: a chat view for Pi coding agents (docs/herdr-chat.md).
// One mod, three places: the chat itself (props.role "chat"), the header of every
// terminal pane (Herdr gives those props.pane), and a picture Pi read, full size
// in a dialog (props.image, opened from its step).

import { View, div, image } from "gpui-kit";
import { closeOverlay, props } from "herdr";
import { ChatView } from "./chat-view.js";
import { PaneHeader } from "./pane-header.js";

export default class PiChat extends View {
  init(_props, cx) {
    const given = props() || {};
    this.part = given.image ? new Picture(given) : given.pane ? new PaneHeader(cx) : new ChatView(cx);
  }

  render(cx) {
    return this.part.render(cx);
  }
}

// A picture full size; a click (or Esc) closes it.
class Picture {
  constructor(given) {
    this.given = given;
  }

  render() {
    return div()
      .id("pi-chat-picture")
      .size_full()
      .p(16)
      .cursor_pointer()
      .on_click(() => closeOverlay(this.given.overlay))
      .child(image(this.given.image).size_full());
  }
}
