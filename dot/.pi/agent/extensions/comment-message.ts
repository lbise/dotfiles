import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  KeybindingsManager,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  fuzzyFilter,
  Input,
  Key,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
} from "@earendil-works/pi-tui";

type Theme = ExtensionContext["ui"]["theme"];

type AssistantMessageCandidate = {
  id: string;
  label: string;
  preview: string;
  searchText: string;
  text: string;
};

// Alt+C works in both legacy terminals and terminals using extended keyboard protocols.
const COMMENT_SHORTCUT = Key.alt("c");
const MAX_VISIBLE_MESSAGES = 8;
const MAX_PREVIEW_LINES = 5;

function assistantText(message: AssistantMessage): string | undefined {
  if (message.stopReason !== "stop") return undefined;

  const text = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text || undefined;
}

export function collectAssistantMessages(branch: SessionEntry[]): AssistantMessageCandidate[] {
  const messages: Array<{ id: string; text: string }> = [];

  for (const entry of branch) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;

    const text = assistantText(entry.message as AssistantMessage);
    if (text) messages.push({ id: entry.id, text });
  }

  return messages
    .map((message, index) => {
      const oneLine = message.text.replace(/\s+/g, " ").trim();
      const number = index + 1;
      const preview = oneLine.length > 100 ? `${oneLine.slice(0, 97)}…` : oneLine;
      const label = `#${number} · ${preview}`;

      return {
        ...message,
        label,
        preview,
        searchText: `${number} ${message.text}`,
      };
    })
    .reverse();
}

export function formatCommentDraft(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

class MessageSelector implements Component, Focusable {
  private readonly input = new Input();
  private filtered: AssistantMessageCandidate[];
  private selectedIndex = 0;
  private _focused = false;

  constructor(
    private readonly messages: AssistantMessageCandidate[],
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly onSelect: (message: AssistantMessageCandidate) => void,
    private readonly onCancel: () => void,
    private readonly requestRender: () => void,
  ) {
    this.filtered = messages;
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.input.focused = value;
  }

  handleInput(data: string): void {
    if (this.keybindings.matches(data, "tui.select.up")) {
      if (this.filtered.length > 0) {
        this.selectedIndex =
          this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
      }
    } else if (this.keybindings.matches(data, "tui.select.down")) {
      if (this.filtered.length > 0) {
        this.selectedIndex =
          this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
      }
    } else if (this.keybindings.matches(data, "tui.select.confirm")) {
      const selected = this.filtered[this.selectedIndex];
      if (selected) this.onSelect(selected);
    } else if (this.keybindings.matches(data, "tui.select.cancel")) {
      this.onCancel();
    } else {
      this.input.handleInput(data);
      this.filtered = fuzzyFilter(this.messages, this.input.getValue(), (message) => message.searchText);
      this.selectedIndex = 0;
    }

    this.requestRender();
  }

  render(width: number): string[] {
    if (width < 6) return [truncateToWidth("Comment", width, "")];

    const contentWidth = width - 4;
    const lines: string[] = [];
    const add = (line = "") => lines.push(truncateToWidth(line, contentWidth, ""));

    add(this.theme.fg("accent", this.theme.bold("Comment on an assistant message")));
    add(this.theme.fg("dim", "Type to fuzzy-search the current branch"));
    add();
    lines.push(
      ...this.input.render(contentWidth).map((line) => truncateToWidth(line, contentWidth, "")),
    );
    add();

    if (this.filtered.length === 0) {
      add(this.theme.fg("warning", "  No matching assistant messages"));
    } else {
      const start = Math.max(
        0,
        Math.min(
          this.selectedIndex - Math.floor(MAX_VISIBLE_MESSAGES / 2),
          this.filtered.length - MAX_VISIBLE_MESSAGES,
        ),
      );
      const end = Math.min(start + MAX_VISIBLE_MESSAGES, this.filtered.length);

      for (let index = start; index < end; index += 1) {
        const message = this.filtered[index];
        if (!message) continue;

        const prefix = index === this.selectedIndex ? "→ " : "  ";
        const available = Math.max(1, contentWidth - visibleWidth(prefix));
        const label = truncateToWidth(message.label, available, "…");
        add(
          index === this.selectedIndex
            ? this.theme.fg("accent", `${prefix}${label}`)
            : `${prefix}${label}`,
        );
      }

      if (this.filtered.length > MAX_VISIBLE_MESSAGES) {
        add(
          this.theme.fg(
            "dim",
            `  (${this.selectedIndex + 1}/${this.filtered.length} matches)`,
          ),
        );
      }

      const selected = this.filtered[this.selectedIndex];
      if (selected) {
        add();
        add(this.theme.fg("muted", "Preview"));
        const previewWidth = Math.max(1, contentWidth - 2);
        const wrappedPreview = wrapTextWithAnsi(selected.text, previewWidth);
        for (const line of wrappedPreview.slice(0, MAX_PREVIEW_LINES)) {
          add(this.theme.fg("dim", `  ${line}`));
        }
        if (wrappedPreview.length > MAX_PREVIEW_LINES) {
          add(this.theme.fg("dim", "  …"));
        }
      }
    }

    add();
    add(this.theme.fg("dim", "↑↓ navigate · enter select · esc cancel"));

    const horizontal = "─".repeat(Math.max(0, width - 2));
    const top = this.theme.fg("borderAccent", `╭${horizontal}╮`);
    const bottom = this.theme.fg("borderAccent", `╰${horizontal}╯`);
    const framed = lines.map((line) => {
      const padding = " ".repeat(Math.max(0, contentWidth - visibleWidth(line)));
      return (
        this.theme.fg("borderAccent", "│") +
        ` ${line}${padding} ` +
        this.theme.fg("borderAccent", "│")
      );
    });
    return [top, ...framed, bottom];
  }

  invalidate(): void {
    this.input.invalidate();
  }
}

async function chooseMessage(
  ctx: ExtensionContext,
  messages: AssistantMessageCandidate[],
): Promise<AssistantMessageCandidate | undefined> {
  return ctx.ui.custom<AssistantMessageCandidate | undefined>(
    (tui, theme, keybindings, done) =>
      new MessageSelector(messages, theme, keybindings, done, () => done(undefined), () =>
        tui.requestRender(),
      ),
    {
      overlay: true,
      overlayOptions: {
        width: "85%",
        maxHeight: "85%",
        minWidth: 50,
        anchor: "center",
        margin: 1,
      },
    },
  );
}

type ExternalEditorResult =
  | { status: "complete"; content: string }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

async function editInExternalEditor(
  ctx: ExtensionContext,
  initialText: string,
): Promise<ExternalEditorResult> {
  const editorCommand =
    process.env.VISUAL ||
    process.env.EDITOR ||
    (process.platform === "win32" ? "notepad" : "nano");
  const directory = mkdtempSync(join(tmpdir(), "pi-comment-"));
  const filePath = join(directory, "comment.md");
  writeFileSync(filePath, initialText, "utf8");

  try {
    return await ctx.ui.custom<ExternalEditorResult>((tui, _theme, _keybindings, done) => {
      tui.stop();

      const [editor, ...editorArgs] = editorCommand.split(" ").filter(Boolean);
      if (!editor) {
        tui.start();
        tui.requestRender(true);
        done({ status: "failed", message: "No external editor command configured" });
        return { render: () => [], invalidate: () => {} };
      }

      let finished = false;
      const finish = (result: ExternalEditorResult) => {
        if (finished) return;
        finished = true;
        tui.start();
        tui.requestRender(true);
        done(result);
      };

      const child = spawn(editor, [...editorArgs, filePath], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });

      child.on("error", (error) =>
        finish({ status: "failed", message: `Could not open ${editorCommand}: ${error.message}` }),
      );
      child.on("close", (code, signal) => {
        if (signal) {
          finish({ status: "cancelled" });
          return;
        }
        if (code !== 0) {
          finish({
            status: "failed",
            message: `${editorCommand} exited with status ${code ?? "unknown"}`,
          });
          return;
        }
        try {
          finish({
            status: "complete",
            content: readFileSync(filePath, "utf8").replace(/\n$/, ""),
          });
        } catch (error) {
          finish({
            status: "failed",
            message: `Could not read the edited comment: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      });

      return { render: () => [], invalidate: () => {} };
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function commentOnMessage(ctx: ExtensionContext): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("Commenting on messages requires TUI mode", "error");
    return;
  }

  if (!ctx.isIdle()) {
    ctx.ui.notify("Wait for the current response to finish before commenting", "warning");
    return;
  }

  const messages = collectAssistantMessages(ctx.sessionManager.getBranch());
  if (messages.length === 0) {
    ctx.ui.notify("No completed assistant messages found on the current branch", "error");
    return;
  }

  const selected = await chooseMessage(ctx, messages);
  if (!selected) return;

  const existingDraft = ctx.ui.getEditorText();
  if (existingDraft.trim()) {
    const replace = await ctx.ui.confirm(
      "Replace current draft?",
      "Your input editor already contains text. Replace it with this comment?",
    );
    if (!replace) return;
  }

  const result = await editInExternalEditor(ctx, formatCommentDraft(selected.text));
  if (result.status === "cancelled") return;
  if (result.status === "failed") {
    ctx.ui.notify(result.message, "error");
    return;
  }

  ctx.ui.setEditorText(result.content);
  ctx.ui.notify("Comment loaded into the input editor; review and submit when ready", "info");
}

export default function commentMessageExtension(pi: ExtensionAPI): void {
  pi.registerCommand("comment", {
    description: "Fuzzy-find an assistant message and prepare a quoted comment",
    handler: async (_args, ctx) => commentOnMessage(ctx),
  });

  pi.registerShortcut(COMMENT_SHORTCUT, {
    description: "Comment on an assistant message",
    handler: commentOnMessage,
  });
}
