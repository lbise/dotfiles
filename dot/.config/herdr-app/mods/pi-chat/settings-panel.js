// Chat settings, under the header's button: accent, ground, how tool activity
// is drawn, and the reading width.

import { div } from "gpui-kit";
import { Input, InputState, h_flex, v_flex } from "gpui-base";
import { ACCENTS, parseAccent } from "./model/settings.js";
import { MONO } from "./ui.js";

const WIDTH = 228;
const GROUND = [
  { value: "black", label: "Black" },
  { value: "graphite", label: "Graphite" },
];
const ACTIVITY = [
  { value: "cells", label: "Cells" },
  { value: "text", label: "Text only" },
];
const READING = [
  { value: 680, label: "Narrow" },
  { value: 760, label: "Medium" },
  { value: 900, label: "Wide" },
];

export class SettingsPanel {
  /** @param {(change: object, cx: object) => void} change Takes the fields that changed. */
  constructor(change) {
    this.change = change;
    this.hex = InputState.new({ placeholder: "#RRGGBB" });
    this.hex.on("submit", (_event, cx) => {
      const accent = parseAccent(this.hex.value());
      this.bad = !accent;
      if (accent) this.change({ accent }, cx);
      else cx.notify();
    });
  }

  /** Call when the panel opens: the field shows the accent in use. */
  opened(look) {
    this.bad = false;
    this.hex.set_value(look.accent);
  }

  label(t, text, value) {
    return h_flex()
      .mt(14)
      .mb(6)
      .text_size(12)
      .text_color(t.muted)
      .child(div().flex_1().child(text))
      .when(value, (el) => el.child(div().font_family(MONO).text_color(t.foreground).child(value)));
  }

  choice(t, name, options, current, field) {
    return h_flex()
      .p(2)
      .rounded(8)
      .bg(t.background)
      .children(
        options.map((option) => {
          const on = option.value === current;
          return div()
            .id(`pi-chat-set-${name}-${option.value}`)
            .flex_1()
            .h(26)
            .flex()
            .items_center()
            .justify_center()
            .rounded(6)
            .text_size(12.5)
            .text_color(on ? t.foreground : t.muted)
            .when(on, (el) => el.bg(t.surface).border_1().border_color(t.border))
            .when(!on, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_event, cx) => this.change({ [field]: option.value }, cx)))
            .child(option.label);
        }),
      );
  }

  swatch(t, accent, on) {
    return div()
      .id(`pi-chat-set-accent-${accent.name}`)
      .size(28)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(14)
      .border_2()
      .border_color(on ? t.foreground : t.surface)
      .cursor_pointer()
      .tooltip(accent.name)
      .accessibility_label(accent.name)
      .on_click((_event, cx) => {
        this.bad = false;
        this.hex.set_value(accent.color);
        this.change({ accent: accent.color }, cx);
      })
      .child(div().size(20).rounded(10).bg(accent.color));
  }

  /**
   * @param {Record<string, string>} t The theme.
   * @param {import("./model/settings.js").ChatSettings} look
   * @param {(cx: object) => void} close
   */
  render(t, look, close) {
    const preset = ACCENTS.find((accent) => accent.color === look.accent);
    return v_flex()
      .id("pi-chat-settings-panel")
      .w(WIDTH)
      .mt(8)
      .p(14)
      .rounded(12)
      .bg(t.surface)
      .border_1()
      .border_color(t.border)
      .shadow_lg()
      .text_color(t.foreground)
      .on_mouse_down_out((_event, cx) => close(cx))
      .child(div().text_size(13).font_semibold().child("Chat settings"))
      .child(this.label(t, "Accent", preset ? preset.name : "Custom"))
      .child(h_flex().gap(4).ml(-4).children(ACCENTS.map((accent) => this.swatch(t, accent, accent.color === look.accent))))
      .child(
        div().mt(8).h(28).px(8).flex().items_center().rounded(7).bg(t.background).border_1().border_color(this.bad ? t.ansi1 : t.background)
          .child(Input.new(this.hex).w_full().font_family(MONO).text_size(12).text_color(t.foreground)),
      )
      .child(this.label(t, "Ground", ""))
      .child(this.choice(t, "ground", GROUND, look.ground, "ground"))
      .child(this.label(t, "Tool activity", ""))
      .child(this.choice(t, "activity", ACTIVITY, look.activity, "activity"))
      .child(this.label(t, "Reading width", String(look.width)))
      .child(this.choice(t, "width", READING, look.width, "width"));
  }
}
