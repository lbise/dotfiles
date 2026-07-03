import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Box, Text, hyperlink } from "@earendil-works/pi-tui";

type Osc8Config = {
  /**
   * URL template used for file paths. Available placeholders:
   * {host}, {user}, {cwd}, {abs}, {rel}, {label}, {line}, {col},
   * {wslDistro}, {tmuxSocket}, {tmuxSession}, {tmuxPane} and *Enc variants.
   * If unset, the extension builds a pi-open://file URL and omits empty fields.
   */
  template?: string;
  /** Automatically linkify existing file paths in assistant/tool output. Default: true. */
  autoLink?: boolean;
};

type Osc8MessageDetails = {
  label: string;
  target: string;
  kind: "file" | "url";
  host?: string;
  user?: string;
  cwd?: string;
  wslDistro?: string;
  tmuxSocket?: string;
  tmuxSession?: string;
  tmuxPane?: string;
  abs?: string;
  rel?: string;
  line?: number;
  col?: number;
};

const CONFIG_PATHS = [
  `${homedir()}/.pi/agent/osc8-links.json`,
];

export default function (pi: ExtensionAPI) {
  pi.on("message_end", async (event, ctx) => {
    if (ctx.mode !== "tui") return;
    const config = loadConfig(ctx as ExtensionCommandContext);
    if (config.autoLink === false) return;

    const message = mapMessageText(event.message, (text) => linkifyFilePaths(text, ctx.cwd));
    if (message !== event.message) return { message };
  });

  pi.on("context", async (event) => {
    const messages = event.messages.map((message: any) => mapMessageText(message, stripOsc8Links));
    return { messages };
  });

  pi.registerMessageRenderer<Osc8MessageDetails>("osc8-link", (message, { expanded }, theme) => {
    const details = message.details;
    if (!details?.target || !details?.label) return undefined;

    let text = hyperlink(safeTerminalText(details.label), safeOscParam(details.target));
    if (expanded) {
      text += theme.fg("dim", `\n→ ${details.target}`);
    }

    const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
    box.addChild(new Text(text, 0, 0));
    return box;
  });

  pi.registerCommand("osc8-link", {
    description: "Emit a clickable OSC8 link. Usage: /osc8-link <path[:line[:col]]|url> [label]",
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      if (!parsed) {
        ctx.ui.notify("Usage: /osc8-link <path[:line[:col]]|url> [label]", "warning");
        return;
      }

      const message = buildMessage(parsed.target, parsed.label, ctx);
      pi.sendMessage({
        customType: "osc8-link",
        content: message.label,
        display: true,
        details: message,
      });
    },
  });

  pi.registerCommand("osc8-test", {
    description: "Emit a test pi-open:// OSC8 link for the local protocol handler",
    handler: async (_args, ctx) => {
      const now = new Date().toISOString();
      const target = buildPiOpenUrl("echo", {
        ...getRuntimeContext(ctx.cwd),
        message: `hello from pi at ${now}`,
      });
      pi.sendMessage({
        customType: "osc8-link",
        content: "Click to test pi-open handler",
        display: true,
        details: {
          kind: "url",
          label: "Click to test pi-open handler",
          target,
          host: hostname(),
          user: getUserName(),
          cwd: ctx.cwd,
          wslDistro: getWslDistro(),
          ...getTmuxContext(),
        } satisfies Osc8MessageDetails,
      });
    },
  });
}

function parseArgs(args: string): { target: string; label?: string } | undefined {
  const tokens = shellishSplit(args.trim());
  if (tokens.length === 0) return undefined;
  const [target, ...labelParts] = tokens;
  if (!target) return undefined;
  return { target, label: labelParts.join(" ") || undefined };
}

function buildMessage(input: string, labelOverride: string | undefined, ctx: ExtensionCommandContext): Osc8MessageDetails {
  if (isUrl(input)) {
    return {
      kind: "url",
      label: labelOverride ?? input,
      target: input,
      host: hostname(),
      cwd: ctx.cwd,
    };
  }

  const parsed = parsePathLineCol(input);
  const abs = resolvePath(parsed.path, ctx.cwd);
  const rel = relative(ctx.cwd, abs) || ".";
  const line = parsed.line ?? 1;
  const col = parsed.col ?? 1;
  const label = labelOverride ?? formatPathLabel(parsed.path, parsed.line, parsed.col);
  const config = loadConfig(ctx);
  const data: Record<string, string | number | undefined> = {
    ...getRuntimeContext(ctx.cwd),
    abs,
    path: abs,
    rel,
    label,
    line,
    col,
  };
  const template = process.env.PI_OSC8_TEMPLATE || config.template;

  return {
    kind: "file",
    label,
    target: template ? applyTemplate(template, data) : buildPiOpenUrl("file", data),
    host: String(data.host),
    user: data.user ? String(data.user) : undefined,
    cwd: ctx.cwd,
    wslDistro: data.wslDistro ? String(data.wslDistro) : undefined,
    tmuxSocket: data.tmuxSocket ? String(data.tmuxSocket) : undefined,
    tmuxSession: data.tmuxSession ? String(data.tmuxSession) : undefined,
    tmuxPane: data.tmuxPane ? String(data.tmuxPane) : undefined,
    abs,
    rel,
    line,
    col,
  };
}

function loadConfig(ctx: ExtensionCommandContext): Osc8Config {
  const paths = [...CONFIG_PATHS];
  if (ctx.isProjectTrusted()) paths.push(`${ctx.cwd}/.pi/osc8-links.json`);

  const merged: Osc8Config = {};
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      Object.assign(merged, JSON.parse(readFileSync(path, "utf8")) as Osc8Config);
    } catch (error) {
      ctx.ui.notify(`Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  }
  return merged;
}

function parsePathLineCol(input: string): { path: string; line?: number; col?: number } {
  const match = input.match(/^(.*?)(?::(\d+))(?::(\d+))?$/);
  if (!match) return { path: input };

  // Avoid treating Windows drive letters like C:\foo as line numbers.
  if (/^[A-Za-z]$/.test(match[1] ?? "")) return { path: input };

  return {
    path: match[1] || input,
    line: Number(match[2]),
    col: match[3] ? Number(match[3]) : undefined,
  };
}

function resolvePath(path: string, cwd: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function formatPathLabel(path: string, line?: number, col?: number): string {
  if (!line) return path;
  return `${path}:${line}${col ? `:${col}` : ""}`;
}

function isUrl(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

function getRuntimeContext(cwd: string): Record<string, string | undefined> {
  return {
    host: hostname(),
    user: getUserName(),
    cwd,
    wslDistro: getWslDistro(),
    ...getTmuxContext(),
  };
}

function getUserName(): string | undefined {
  return process.env.USER || process.env.LOGNAME || userInfo().username;
}

function getWslDistro(): string | undefined {
  return process.env.WSL_DISTRO_NAME || undefined;
}

function getTmuxContext(): { tmuxSocket?: string; tmuxSession?: string; tmuxPane?: string } {
  const result: { tmuxSocket?: string; tmuxSession?: string; tmuxPane?: string } = {};
  const tmux = process.env.TMUX;
  if (tmux) result.tmuxSocket = tmux.split(",", 1)[0] || undefined;
  if (process.env.TMUX_PANE) result.tmuxPane = process.env.TMUX_PANE;

  try {
    const session = execFileSync("tmux", ["display-message", "-p", "#S"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).trim();
    if (session) result.tmuxSession = session;
  } catch {
    // Not in tmux, or tmux is unavailable. Omit tmux fields.
  }

  return result;
}

function buildPiOpenUrl(action: string, data: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const key of [
    "host",
    "user",
    "wslDistro",
    "cwd",
    "path",
    "line",
    "col",
    "tmuxSocket",
    "tmuxSession",
    "tmuxPane",
    "message",
  ]) {
    const value = data[key];
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return `pi-open://${action}?${params.toString()}`;
}

function linkifyFilePaths(text: string, cwd: string): string {
  if (!text || text.includes("\x1b]8;;")) return text;

  return text.replace(/(^|[\s("'`])((?:\.{1,2}\/|\/|~\/|[A-Za-z0-9_.-]+\/)[^\s"'`<>|{}\[\]]+)/g, (match, prefix: string, token: string) => {
    const linked = linkifyToken(token, cwd);
    return linked === token ? match : `${prefix}${linked}`;
  });
}

function linkifyToken(token: string, cwd: string): string {
  const trailingMatch = token.match(/[),.;!?]+$/);
  const trailing = trailingMatch?.[0] ?? "";
  const core = trailing ? token.slice(0, -trailing.length) : token;
  if (!core || isUrl(core) || core.includes("\x1b")) return token;

  const parsed = parsePathLineCol(core);
  const abs = resolvePath(parsed.path, cwd);
  if (!isExistingRegularFile(abs)) return token;

  const line = parsed.line ?? 1;
  const col = parsed.col ?? 1;
  const rel = relative(cwd, abs) || ".";
  const data: Record<string, string | number | undefined> = {
    ...getRuntimeContext(cwd),
    abs,
    path: abs,
    rel,
    label: core,
    line,
    col,
  };
  const url = buildPiOpenUrl("file", data);
  return hyperlink(safeTerminalText(core), safeOscParam(url)) + trailing;
}

function isExistingRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function stripOsc8Links(text: string): string {
  if (!text || !text.includes("\x1b]8;;")) return text;
  return text.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}

function mapMessageText(message: any, mapper: (text: string) => string): any {
  if (!message || typeof message !== "object") return message;
  let changed = false;
  const next = { ...message };

  if (Array.isArray(message.content)) {
    const content = message.content.map((part: any) => {
      if (!part || part.type !== "text" || typeof part.text !== "string") return part;
      const text = mapper(part.text);
      if (text === part.text) return part;
      changed = true;
      return { ...part, text };
    });
    if (changed) next.content = content;
  } else if (typeof message.content === "string") {
    const content = mapper(message.content);
    if (content !== message.content) {
      changed = true;
      next.content = content;
    }
  }

  if (typeof message.output === "string") {
    const output = mapper(message.output);
    if (output !== message.output) {
      changed = true;
      next.output = output;
    }
  }

  return changed ? next : message;
}

function applyTemplate(template: string, data: Record<string, string | number | undefined>): string {
  return template.replace(/\{([A-Za-z0-9_]+?)(Enc)?\}/g, (_match, key: string, enc: string | undefined) => {
    const value = data[key];
    if (value === undefined || value === null) return "";
    const text = String(value);
    return enc ? encodeURIComponent(text) : text;
  });
}

function safeOscParam(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, "");
}

function safeTerminalText(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function shellishSplit(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if ((ch === "'" || ch === '"') && !quote) {
      quote = ch;
      continue;
    }
    if (quote === ch) {
      quote = undefined;
      continue;
    }
    if (!quote && /\s/.test(ch)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (escaping) current += "\\";
  if (current) result.push(current);
  return result;
}
