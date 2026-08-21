import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

export type AgentSource = "packaged" | "user" | "project";

export type TaskAgent = {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
  thinking?: string;
  hidden: boolean;
  source: AgentSource;
  filePath: string;
};

export type AgentDiscovery = {
  agents: TaskAgent[];
  diagnostics: string[];
  projectAgentsDir?: string;
};

type DiscoveryOptions = {
  packagedDir: string;
  userDir: string;
  cwd: string;
  projectTrusted: boolean;
};

type ParsedAgent = Omit<TaskAgent, "source" | "filePath"> & { disabled: boolean };

function agentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return agentFiles(file);
    return entry.isFile() && extname(entry.name) === ".md" ? [file] : [];
  });
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error("invalid quoted frontmatter value");
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

function scalar(value: string): string | boolean | string[] | undefined {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).split(",").map(unquote).filter(Boolean);
  }
  return trimmed ? unquote(trimmed) : undefined;
}

function parseAgent(filePath: string): ParsedAgent {
  const content = readFileSync(filePath, "utf8");
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/m.exec(content);
  const values = new Map<string, string | boolean | string[]>();
  let prompt = content;
  if (match) {
    prompt = match[2] ?? "";
    for (const line of match[1].split("\n")) {
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      const property = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
      if (!property) throw new Error("frontmatter must use simple key: value entries");
      const value = scalar(property[2]);
      if (value !== undefined) values.set(property[1], value);
    }
  }
  const fallbackName = basename(filePath, ".md");
  const name = values.get("name") ?? fallbackName;
  const disabled = values.get("disabled") === true;
  if (typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("name must be a simple identifier");
  const description = values.get("description");
  if (!disabled && typeof description !== "string") throw new Error("description is required");

  const toolsValue = values.get("tools");
  if (toolsValue !== undefined && !Array.isArray(toolsValue) && typeof toolsValue !== "string") {
    throw new Error("tools must be a string or string array");
  }
  const tools = (Array.isArray(toolsValue) ? toolsValue : toolsValue?.split(","))
    ?.map((item) => item.trim())
    .filter(Boolean);
  if (tools?.some((tool) => !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(tool))) {
    throw new Error("tools must contain valid tool names");
  }

  const model = values.get("model");
  const thinking = values.get("thinking");
  const hiddenValue = values.get("hidden");
  const disabledValue = values.get("disabled");
  if (typeof model !== "undefined" && (typeof model !== "string" || !model.includes("/"))) {
    throw new Error("model must use provider/model format");
  }
  if (
    typeof thinking !== "undefined" &&
    (typeof thinking !== "string" || !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(thinking))
  ) {
    throw new Error("thinking must be a supported Pi thinking level");
  }
  if (hiddenValue !== undefined && typeof hiddenValue !== "boolean") throw new Error("hidden must be a boolean");
  if (disabledValue !== undefined && typeof disabledValue !== "boolean") throw new Error("disabled must be a boolean");

  return {
    name,
    description: typeof description === "string" ? description : "",
    prompt: prompt.trim(),
    tools,
    model,
    thinking,
    hidden: hiddenValue === true,
    disabled,
  };
}

function nearestProjectAgentsDir(cwd: string): string | undefined {
  let current = cwd;
  while (true) {
    const candidate = join(current, ".pi", "agents");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function discoverAgents(options: DiscoveryOptions): AgentDiscovery {
  const diagnostics: string[] = [];
  const projectAgentsDir = nearestProjectAgentsDir(options.cwd);
  const result = new Map<string, TaskAgent>();
  const disabled = new Set<string>();
  const layers: Array<{ source: AgentSource; dir?: string }> = [
    { source: "packaged", dir: options.packagedDir },
    { source: "user", dir: options.userDir },
    ...(options.projectTrusted ? [{ source: "project" as const, dir: projectAgentsDir }] : []),
  ];
  for (const layer of layers) {
    if (!layer.dir) continue;
    for (const filePath of agentFiles(layer.dir)) {
      try {
        const agent = parseAgent(filePath);
        if (agent.disabled) {
          result.delete(agent.name);
          disabled.add(agent.name);
          continue;
        }
        disabled.delete(agent.name);
        result.set(agent.name, { ...agent, source: layer.source, filePath });
      } catch (error) {
        diagnostics.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { agents: [...result.values()].filter((agent) => !disabled.has(agent.name)).sort((a, b) => a.name.localeCompare(b.name)), diagnostics, projectAgentsDir };
}
