// Pi's subagents (the delegate extension): the running ones in a strip over the
// reply box, a finished one's line in the conversation. Pressing either opens
// the subagent's own conversation, read only (ChatView.openChild).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { formatDuration, formatTokens } from "./model/format.js";
import { MONO, icon } from "./ui.js";

const LINE = 26;
const ENDED = { completed: "check", failed: "close", aborted: "stop", interrupted: "stop" };

/** A subagent's line: what it is, what it does or how it ended, and its figures. */
function line(t, id, glyph, agent, title, doing, figures, open) {
  return h_flex()
    .id(id)
    .h(LINE)
    .flex_none()
    .px(8)
    .gap(8)
    .items_center()
    .rounded(7)
    .text_size(13)
    .child(glyph)
    .child(div().w(64).flex_none().truncate().font_family(MONO).text_size(12).text_color(t.muted).child(agent))
    .child(div().flex_shrink(1).min_w(0).truncate().text_color(t.foreground).child(title || "Subagent"))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(doing))
    .child(div().flex_none().font_family(MONO).text_size(12).text_color(t.muted).child(figures))
    .when(open !== null, (el) =>
      el
        .cursor_pointer()
        .hover((s) => s.bg(t.surface))
        .tooltip("Open its conversation")
        .accessibility_label(`Open the ${agent} subagent ${title}`)
        .on_click((_event, cx) => open(cx)),
    );
}

/**
 * The running subagents, newest last. Null when none runs.
 * @param {Record<string, string>} t
 * @param {import("./model/protocol.js").LiveTask[]} tasks
 * @param {number|null} now The agent machine's time.
 * @param {(task: object, cx: object) => void} open
 */
export function taskStrip(t, tasks, now, open) {
  if (!tasks.length) return null;
  const rows = tasks.map((task) => {
    const doing = task.status === "queued" ? "starting" : task.currentTool ? task.currentTool : "thinking";
    const took = now !== null && task.startedAt ? formatDuration(Math.max(1000, now - task.startedAt)) : "";
    const figures = [task.tokens ? formatTokens(task.tokens) : "", took].filter(Boolean).join(" · ");
    const glyph = div().w(16).flex_none().flex().justify_center().text_color(t.foreground).child(icon("spinner", 11).spin(900));
    return line(t, `pi-chat-task-${task.id}`, glyph, task.agent, task.title, doing, figures, task.sessionPath ? (cx) => open(task, cx) : null);
  });
  const count = tasks.length;
  return v_flex()
    .id("pi-chat-tasks")
    .w_full()
    .mt(10)
    .py(4)
    .rounded(10)
    .border_1()
    .border_color(t.border)
    .child(
      h_flex().h(22).px(8).gap(8).items_center().text_size(12).text_color(t.muted)
        .child(div().w(16).flex_none().flex().justify_center().child(icon("agents", 13)))
        .child(`${count} ${count === 1 ? "subagent" : "subagents"} running`),
    )
    .children(rows);
}

/**
 * A finished subagent, where its completion message stands in the conversation.
 * @param {Record<string, string>} t
 * @param {string} key
 * @param {import("./model/transcript.js").TaskRef} task
 * @param {(task: object, cx: object) => void} open
 */
export function subagentNote(t, key, task, open) {
  const status = task.status || "completed";
  const glyph = div().w(16).flex_none().flex().justify_center()
    .text_color(status === "completed" ? t.muted : t.ansi1)
    .child(icon(ENDED[status] || "check", 13));
  return div().w_full().pt(10).child(line(t, `pi-chat-subagent-${key}`, glyph, task.agent, task.title, status, "", (cx) => open(task, cx)));
}

/** What a step list says for a completion message. */
export function subagentRemark(task) {
  return `${task.agent || "Subagent"} ${task.status || "completed"}: ${task.title}`;
}
