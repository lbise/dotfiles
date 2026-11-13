/**
 * What Pi's /resume and /tree pickers offer, as plain data for sessions.json and tree.json.
 * Mirrors Pi's SessionSelector and TreeSelector (default filter); see docs/herdr-chat.md.
 */

import { stepLabel } from "./steps.ts";

export const MAX_SESSIONS = 50;
const MAX_TEXT = 200;

const oneLine = (text: unknown) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "");

/** Pi's SessionInfo, the fields used here. */
export type SessionInfo = { path: string; cwd: string; name?: string; firstMessage: string; modified: Date; messageCount: number };

/** `infos` as SessionManager.list() returns them: newest first. */
export function sessionItems(infos: SessionInfo[], currentFile: string | undefined) {
  return infos.slice(0, MAX_SESSIONS).map((info) => ({
    path: info.path,
    title: oneLine(info.name ?? info.firstMessage),
    cwd: info.cwd,
    modified: info.modified.getTime(),
    messages: info.messageCount,
    current: info.path === currentFile,
  }));
}

type TreeNode = { entry: any; children: TreeNode[]; label?: string };

/** Entry types /tree hides in its default view. */
const SETTINGS = new Set(["label", "context_edit", "custom", "model_change", "thinking_level_change", "session_info", "usage"]);

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("");
}

/**
 * The entries /tree lets you jump to, in its order (pre-order, the active branch first among
 * siblings), each with its nearest listed ancestor as parent. `roots` is SessionManager.getTree().
 */
export function treeItems(roots: TreeNode[], leafId: string | null, cwd: string) {
  const parentOf = new Map<string, string | null>();
  const toolCalls = new Map<string, { name: string; arguments: unknown }>();
  for (const stack = [...roots]; stack.length; ) {
    const { entry, children } = stack.pop()!;
    parentOf.set(entry.id, entry.parentId ?? null);
    if (entry.type === "message" && entry.message?.role === "assistant" && Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) if (block?.type === "toolCall") toolCalls.set(block.id, block);
    }
    stack.push(...children);
  }
  const active = new Set<string>();
  for (let id = leafId; id && !active.has(id); id = parentOf.get(id) ?? null) active.add(id);

  function text(entry: any): string | undefined {
    if (SETTINGS.has(entry.type)) return undefined;
    const message = entry.message;
    switch (entry.type) {
      case "message":
        switch (message?.role) {
          case "user":
            return oneLine(contentText(message.content));
          case "assistant": {
            const said = oneLine(contentText(message.content));
            if (said) return said;
            const failed = message.stopReason && message.stopReason !== "stop" && message.stopReason !== "toolUse";
            if (!failed && entry.id !== leafId) return undefined; // tool calls only: hidden like in /tree
            return message.stopReason === "aborted" ? "(aborted)" : oneLine(message.errorMessage) || "(no content)";
          }
          case "toolResult": {
            const call = toolCalls.get(message.toolCallId);
            return oneLine(call ? `${call.name} ${stepLabel(call.arguments, cwd)}` : (message.toolName ?? "tool"));
          }
          case "bashExecution":
            return oneLine(message.command);
          default:
            return "";
        }
      case "custom_message":
        return oneLine(contentText(entry.content));
      case "compaction":
        return `${Math.round((entry.tokensBefore ?? 0) / 1000)}k tokens`;
      case "branch_summary":
        return oneLine(entry.summary);
      default:
        return "";
    }
  }

  const items = [];
  const activeFirst = (nodes: TreeNode[]) => [...nodes].sort((a, b) => Number(active.has(b.entry.id)) - Number(active.has(a.entry.id)));
  const stack: [TreeNode, string | null][] = activeFirst(roots).reverse().map((node) => [node, null]);
  while (stack.length) {
    const [node, parentId] = stack.pop()!;
    const { entry } = node;
    const shown = text(entry);
    if (shown !== undefined) {
      items.push({
        id: entry.id,
        parentId,
        role: entry.type === "message" ? (entry.message?.role ?? "message") : entry.type,
        text: shown,
        timestamp: Date.parse(entry.timestamp),
        active: active.has(entry.id),
        label: node.label ?? null,
      });
    }
    const next = shown !== undefined ? entry.id : parentId;
    for (const child of activeFirst(node.children).reverse()) stack.push([child, next]);
  }
  return items;
}
