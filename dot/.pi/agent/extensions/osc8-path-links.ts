/**
 * OSC 8 path links for pi tool output.
 *
 * Goal:
 * - Make file paths in tool output clickable in terminals that support OSC 8 hyperlinks.
 * - Start with built-in file-oriented tools.
 *
 * Notes:
 * - Default scheme is file:// so links are immediately usable.
 * - Set PI_PATH_LINK_SCHEME=nvim to emit nvim://open?path=... links instead,
 *   which can later be wired to a custom URI handler.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { homedir } from "os";
import path from "path";
import { pathToFileURL } from "url";

type BuiltInTools = ReturnType<typeof createBuiltInTools>;

type LinkLocation = {
	line?: number;
	col?: number;
};

const LINK_SCHEME = (process.env.PI_PATH_LINK_SCHEME || "file").trim().toLowerCase();
const toolCache = new Map<string, BuiltInTools>();

function createBuiltInTools(cwd: string) {
	return {
		read: createReadTool(cwd),
		write: createWriteTool(cwd),
		edit: createEditTool(cwd),
		find: createFindTool(cwd),
		grep: createGrepTool(cwd),
		ls: createLsTool(cwd),
	};
}

function getBuiltInTools(cwd: string): BuiltInTools {
	let tools = toolCache.get(cwd);
	if (!tools) {
		tools = createBuiltInTools(cwd);
		toolCache.set(cwd, tools);
	}
	return tools;
}

function normalizePathArg(filePath: string): string {
	return filePath.startsWith("@") ? filePath.slice(1) : filePath;
}

function shortenPath(filePath: string): string {
	const home = homedir();
	return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath;
}

function osc8(url: string, label: string): string {
	return `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`;
}

function buildLinkUrl(absolutePath: string, location?: LinkLocation): string {
	const normalized = path.resolve(absolutePath);

	if (LINK_SCHEME === "nvim") {
		const url = new URL("nvim://open");
		url.searchParams.set("path", normalized);
		if (location?.line != null) url.searchParams.set("line", String(location.line));
		if (location?.col != null) url.searchParams.set("col", String(location.col));
		return url.toString();
	}

	const url = pathToFileURL(normalized);
	if (location?.line != null) {
		url.hash = location.col != null ? `L${location.line}:${location.col}` : `L${location.line}`;
	}
	return url.toString();
}

function linkPath(absolutePath: string, label: string, location?: LinkLocation): string {
	return osc8(buildLinkUrl(absolutePath, location), label);
}

function linkedDisplayPath(cwd: string, rawPath: string, themedLabel: string, location?: LinkLocation): string {
	const absolutePath = path.resolve(cwd, normalizePathArg(rawPath));
	return linkPath(absolutePath, themedLabel, location);
}

function isNoticeLine(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith("[") && trimmed.endsWith("]");
}

function isDirectoryLabel(label: string): boolean {
	return label.endsWith("/");
}

function splitDirectoryLabel(label: string): { base: string; trailingSlash: string } {
	if (!isDirectoryLabel(label)) return { base: label, trailingSlash: "" };
	return { base: label.slice(0, -1), trailingSlash: "/" };
}

function renderSimpleLinkedList(
	text: string,
	cwd: string,
	rootPath: string | undefined,
	theme: Parameters<NonNullable<BuiltInTools["find"]["renderResult"]>>[2],
): string {
	const rootAbsolute = path.resolve(cwd, normalizePathArg(rootPath || "."));

	return text
		.split("\n")
		.map((line) => {
			if (!line) return "";
			if (isNoticeLine(line)) return theme.fg("warning", line);
			if (line === "No files found matching pattern" || line === "(empty directory)") {
				return theme.fg("muted", line);
			}

			const { base, trailingSlash } = splitDirectoryLabel(line);
			const absolutePath = path.resolve(rootAbsolute, base || ".");
			const linked = linkPath(absolutePath, theme.fg("accent", line));
			return trailingSlash ? linked : linked;
		})
		.join("\n");
}

function renderGrepOutput(
	text: string,
	cwd: string,
	rootPath: string | undefined,
	theme: Parameters<NonNullable<BuiltInTools["grep"]["renderResult"]>>[2],
): string {
	const rootAbsolute = path.resolve(cwd, normalizePathArg(rootPath || "."));

	return text
		.split("\n")
		.map((line) => {
			if (!line) return "";
			if (isNoticeLine(line)) return theme.fg("warning", line);
			if (line === "No matches found") return theme.fg("muted", line);

			const matchLine = line.match(/^(.*):(\d+):(.*)$/);
			if (matchLine) {
				const [, relativePath, lineNumber, rest] = matchLine;
				const absolutePath = path.resolve(rootAbsolute, relativePath);
				const prefix = linkPath(
					absolutePath,
					theme.fg("accent", `${relativePath}:${lineNumber}`),
					{ line: Number(lineNumber) },
				);
				return `${prefix}${theme.fg("toolOutput", `:${rest}`)}`;
			}

			const contextLine = line.match(/^(.*)-(\d+)-\s?(.*)$/);
			if (contextLine) {
				const [, relativePath, lineNumber, rest] = contextLine;
				const absolutePath = path.resolve(rootAbsolute, relativePath);
				const prefix = linkPath(
					absolutePath,
					theme.fg("muted", `${relativePath}-${lineNumber}`),
					{ line: Number(lineNumber) },
				);
				return `${prefix}${theme.fg("dim", `- ${rest}`)}`;
			}

			return theme.fg("toolOutput", line);
		})
		.join("\n");
}

export default function osc8PathLinks(pi: ExtensionAPI) {
	pi.registerTool({
		name: "read",
		label: "read",
		description: getBuiltInTools(process.cwd()).read.description,
		parameters: getBuiltInTools(process.cwd()).read.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).read.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, context) {
			const normalizedPath = normalizePathArg(args.path || "");
			const displayPath = shortenPath(normalizedPath);
			const line = args.offset != null ? args.offset : undefined;
			let linked = linkedDisplayPath(context.cwd, normalizedPath, theme.fg("accent", displayPath), { line });
			if (args.offset !== undefined || args.limit !== undefined) {
				const start = args.offset ?? 1;
				const end = args.limit != null ? start + args.limit - 1 : undefined;
				linked += theme.fg("warning", end != null ? `:${start}-${end}` : `:${start}`);
			}
			return new Text(`${theme.fg("toolTitle", theme.bold("read"))} ${linked}`, 0, 0);
		},
	});

	pi.registerTool({
		name: "write",
		label: "write",
		description: getBuiltInTools(process.cwd()).write.description,
		parameters: getBuiltInTools(process.cwd()).write.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).write.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, context) {
			const normalizedPath = normalizePathArg(args.path || "");
			const displayPath = shortenPath(normalizedPath);
			const linked = linkedDisplayPath(context.cwd, normalizedPath, theme.fg("accent", displayPath));
			const lineCount = typeof args.content === "string" ? args.content.split("\n").length : 0;
			const suffix = lineCount > 0 ? theme.fg("muted", ` (${lineCount} lines)`) : "";
			return new Text(`${theme.fg("toolTitle", theme.bold("write"))} ${linked}${suffix}`, 0, 0);
		},
	});

	pi.registerTool({
		name: "edit",
		label: "edit",
		description: getBuiltInTools(process.cwd()).edit.description,
		parameters: getBuiltInTools(process.cwd()).edit.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).edit.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, context) {
			const normalizedPath = normalizePathArg(args.path || "");
			const displayPath = shortenPath(normalizedPath);
			const linked = linkedDisplayPath(context.cwd, normalizedPath, theme.fg("accent", displayPath));
			return new Text(`${theme.fg("toolTitle", theme.bold("edit"))} ${linked}`, 0, 0);
		},
	});

	pi.registerTool({
		name: "find",
		label: "find",
		description: getBuiltInTools(process.cwd()).find.description,
		parameters: getBuiltInTools(process.cwd()).find.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).find.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, context) {
			const basePath = normalizePathArg(args.path || ".");
			const linkedBase = linkedDisplayPath(context.cwd, basePath, theme.fg("accent", shortenPath(basePath)));
			let text = `${theme.fg("toolTitle", theme.bold("find"))} ${theme.fg("accent", args.pattern || "")}`;
			text += theme.fg("toolOutput", " in ") + linkedBase;
			if (args.limit != null) text += theme.fg("muted", ` (limit ${args.limit})`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, context) {
			const textContent = result.content.find((item) => item.type === "text");
			const output = textContent?.type === "text" ? textContent.text : "";
			const linkedOutput = renderSimpleLinkedList(output, context.cwd, context.args.path, theme);
			return new Text(linkedOutput, 0, 0);
		},
	});

	pi.registerTool({
		name: "grep",
		label: "grep",
		description: getBuiltInTools(process.cwd()).grep.description,
		parameters: getBuiltInTools(process.cwd()).grep.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).grep.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, context) {
			const basePath = normalizePathArg(args.path || ".");
			const linkedBase = linkedDisplayPath(context.cwd, basePath, theme.fg("accent", shortenPath(basePath)));
			let text = `${theme.fg("toolTitle", theme.bold("grep"))} ${theme.fg("accent", `/${args.pattern || ""}/`)}`;
			text += theme.fg("toolOutput", " in ") + linkedBase;
			if (args.glob) text += theme.fg("muted", ` (${args.glob})`);
			if (args.limit != null) text += theme.fg("muted", ` (limit ${args.limit})`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, context) {
			const textContent = result.content.find((item) => item.type === "text");
			const output = textContent?.type === "text" ? textContent.text : "";
			const linkedOutput = renderGrepOutput(output, context.cwd, context.args.path, theme);
			return new Text(linkedOutput, 0, 0);
		},
	});

	pi.registerTool({
		name: "ls",
		label: "ls",
		description: getBuiltInTools(process.cwd()).ls.description,
		parameters: getBuiltInTools(process.cwd()).ls.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).ls.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, context) {
			const basePath = normalizePathArg(args.path || ".");
			const linkedBase = linkedDisplayPath(context.cwd, basePath, theme.fg("accent", shortenPath(basePath)));
			let text = `${theme.fg("toolTitle", theme.bold("ls"))} ${linkedBase}`;
			if (args.limit != null) text += theme.fg("muted", ` (limit ${args.limit})`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, context) {
			const textContent = result.content.find((item) => item.type === "text");
			const output = textContent?.type === "text" ? textContent.text : "";
			const linkedOutput = renderSimpleLinkedList(output, context.cwd, context.args.path, theme);
			return new Text(linkedOutput, 0, 0);
		},
	});

	pi.registerCommand("osc8-links", {
		description: "Show OSC 8 path link configuration",
		handler: async (_args, ctx) => {
			ctx.ui.notify(`OSC 8 path links active (scheme: ${LINK_SCHEME})`, "info");
		},
	});
}
