// Parts both lists draw with: the card, status marks, step cells, the machine tag
// and the strip a card gets while its machine cannot be reached.

import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { machineLabel } from "./data.js";

export const MONO = "Geist Mono";

export const chrome = (name, size = 13) => svg(`mods/workspace-chrome/${name}.svg`).size(size).flex_none();
export const icon = (name, size = 13) => svg(`mods/leo-sidebar/${name}.svg`).size(size).flex_none();

/** A card: rule border, 10px radius; the shown one on surface with an input border. */
export function card(t, id, on, alert) {
  const edge = alert === "connecting" ? t.ansi3 : alert && alert !== "ok" ? t.ansi1 : null;
  return v_flex()
    .id(id)
    .flex_none()
    .rounded(10)
    .border_1()
    .border_color(edge ? edge + "73" : on ? t.input : t.border)
    .bg(on ? t.selected : t.chrome)
    .overflow_hidden()
    .cursor_pointer()
    .when(!on, (el) => el.hover((s) => s.bg(t.hover)));
}

/** The agents mod's marks: a spinner working, "Needs you", a dot done, a ring idle. */
export function mark(t, status, compact = false) {
  if (status === "working") return chrome("spinner", 12).mx(1).text_color(t.working ?? t.foreground).spin(900);
  if (status === "blocked" && compact) return div().size(8).mx(2).flex_none().rounded(4).bg(t.blocked);
  if (status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
  if (status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  if (status === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done ?? t.foreground);
  return div().size(7).mx(3).flex_none();
}

/**
 * The agent's program icon (Pi, Claude…) on a surface tile, as in the pane header,
 * its status a badge on the corner: a spinner working, a dot needing you or done,
 * a ring idle.
 */
export function agentTile(t, program, status, size = 26, number = null) {
  // Alt+A: the card's number on a chalk tile instead.
  if (number) {
    return div().size(size).flex_none().rounded(7).bg(t.accent).flex().items_center().justify_center()
      .font_family(MONO).text_size(13).font_semibold().text_color(t.accent_foreground ?? t.background).child(String(number));
  }
  const glyph = program?.icon
    ? (program.tint ? svg(program.icon).size(15).flex_none().text_color(t.foreground) : image(program.icon).w(15).h(15).flex_none())
    : div().text_size(11).font_semibold().text_color(t.muted).child((program?.name ?? "?").slice(0, 1).toUpperCase());
  const badge = div().absolute().right(-3).bottom(-3).size(11).rounded(6).bg(t.chrome).flex().items_center().justify_center()
    .child(status === "working" ? chrome("spinner", 10).text_color(t.working ?? t.foreground).spin(900)
      : status === "idle" ? div().size(6).rounded(3).border(1.5).border_color(t.idle ?? t.dim)
      : div().size(7).rounded(4).bg(status === "blocked" ? t.blocked : (t.done ?? t.foreground)));
  return div().relative().size(size).flex_none().rounded(7).bg(t.surface).flex().items_center().justify_center()
    .child(glyph).child(badge);
}

/** One cell per step, coloured by kind (pi-chat's cells), the oldest giving way to "+N". */
export function cells(t, steps, max = 22) {
  const color = (s) => (s.ok === false ? t.ansi1 : s.kind === "look" ? t.ansi4 : s.kind === "run" ? t.ansi5 : s.kind === "edit" ? t.ansi3 : t.dim);
  const shown = steps.slice(-max);
  return h_flex().flex_none().gap(2).items_center()
    .when(steps.length > max, (el) => el.child(div().mr(3).font_family(MONO).text_size(11).text_color(t.dim).child(`+${steps.length - max}`)))
    .children(shown.map((s) => div().w(5).h(12).flex_none().rounded(1.5).bg(color(s)).when(s.endedAt == null, (el) => el.opacity(0.45))));
}

/** The machine a card is on, quiet: a server (or monitor, this computer) and its name. */
export function machineTag(t, machine) {
  return h_flex().flex_none().gap(4).items_center().font_family(MONO).text_size(11.5).text_color(t.muted)
    .child(chrome(machine ? "server" : "monitor", 11))
    .child(machine ? machineLabel(machine) : "this computer");
}

/** The loud strip under a card whose machine is not answering. Null when it is. */
export function alertStrip(t, id, machine, state) {
  if (!machine || state === "ok") return null;
  const amber = state === "connecting";
  const color = amber ? t.ansi3 : t.ansi1;
  const name = machineLabel(machine);
  const text = { connecting: `Connecting to ${name}…`, down: `${name} unreachable`, login: `${name} needs a login` }[state];
  return h_flex().id(`alert-${id}`).h(30).px(11).gap(7).items_center().flex_none()
    .border_t(1).border_color(color + "4d").bg(color + "1a")
    .text_size(12).font_medium().text_color(color)
    .child(amber ? chrome("spinner", 12).spin(900) : icon(state === "login" ? "key" : "alert", 13))
    .child(div().flex_1().min_w(0).truncate().child(text))
    .when(state === "login", (el) => el.child(div().id(`alert-copy-${id}`).flex_none().px(6).py(2).rounded(5).text_size(11.5).bg(color + "26")
      .hover((s) => s.bg(color + "40"))
      .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(`hc machine login ${machine}`); })
      .child("Copy command")));
}
