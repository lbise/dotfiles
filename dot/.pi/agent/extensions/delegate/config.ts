import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

import type { AgentDiscovery, TaskAgent } from "./agents.ts";

const THINKING_LEVELS = new Set<ThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

type SettingsObject = Record<string, unknown>;

export type AgentSettingsOverride = {
  /** null means inherit the parent model; undefined means keep the agent-file value. */
  model?: string | null;
  thinking?: ThinkingLevel;
};

export type DelegateConfiguration = {
  agents: Map<string, AgentSettingsOverride>;
  /** Package sources, as written in settings `packages`, whose extensions load into child sessions. */
  extensions: string[];
  diagnostics: string[];
};

export type ExtensionResource = { path: string; enabled: boolean; metadata: { source: string } };

/** Pick the enabled extension entry points that belong to the configured package sources. */
export function selectChildExtensions(
  resources: readonly ExtensionResource[],
  sources: readonly string[],
): { paths: string[]; missing: string[] } {
  const enabled = resources.filter((resource) => resource.enabled);
  const paths = enabled.filter((resource) => sources.includes(resource.metadata.source)).map((resource) => resource.path);
  const missing = sources.filter((source) => !enabled.some((resource) => resource.metadata.source === source));
  return { paths, missing };
}

function isObject(value: unknown): value is SettingsObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isObject(base) || !isObject(override)) return override === undefined ? base : override;
  const result: SettingsObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = deepMerge(result[key], value);
  }
  return result;
}

export function parseDelegateConfiguration(
  globalSettings: unknown,
  projectSettings: unknown = {},
): DelegateConfiguration {
  const diagnostics: string[] = [];
  const agents = new Map<string, AgentSettingsOverride>();
  const extensions: string[] = [];
  const globalDelegate = isObject(globalSettings) ? globalSettings.delegate : undefined;
  const projectDelegate = isObject(projectSettings) ? projectSettings.delegate : undefined;
  const delegate = deepMerge(globalDelegate, projectDelegate);
  if (delegate === undefined) return { agents, extensions, diagnostics };
  if (!isObject(delegate)) {
    return { agents, extensions, diagnostics: ["settings.json: delegate must be an object"] };
  }
  if (delegate.extensions !== undefined) {
    if (Array.isArray(delegate.extensions) && delegate.extensions.every((source) => typeof source === "string")) {
      extensions.push(...delegate.extensions);
    } else {
      diagnostics.push("settings.json: delegate.extensions must be an array of package sources");
    }
  }
  if (delegate.agents === undefined) return { agents, extensions, diagnostics };
  if (!isObject(delegate.agents)) {
    diagnostics.push("settings.json: delegate.agents must be an object");
    return { agents, extensions, diagnostics };
  }

  for (const [name, value] of Object.entries(delegate.agents)) {
    const setting = `settings.json: delegate.agents.${name}`;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      diagnostics.push(`${setting}: agent name must be a simple identifier`);
      continue;
    }
    if (!isObject(value)) {
      diagnostics.push(`${setting} must be an object`);
      continue;
    }

    const override: AgentSettingsOverride = {};
    if (value.model !== undefined) {
      if (value.model === "parent") {
        override.model = null;
      } else if (
        typeof value.model === "string" &&
        /^[^/\s]+\/[^\s]+$/.test(value.model)
      ) {
        override.model = value.model;
      } else {
        diagnostics.push(`${setting}.model must be "parent" or use provider/model format`);
      }
    }
    if (value.thinking !== undefined) {
      if (typeof value.thinking === "string" && THINKING_LEVELS.has(value.thinking as ThinkingLevel)) {
        override.thinking = value.thinking as ThinkingLevel;
      } else {
        diagnostics.push(`${setting}.thinking must be a supported Pi thinking level`);
      }
    }
    agents.set(name, override);
  }
  return { agents, extensions, diagnostics };
}

export function configureAgents(
  discovery: AgentDiscovery,
  configuration: DelegateConfiguration,
): AgentDiscovery {
  const knownAgents = new Set(discovery.agents.map((agent) => agent.name));
  const diagnostics = [...discovery.diagnostics, ...configuration.diagnostics];
  for (const name of configuration.agents.keys()) {
    if (!knownAgents.has(name)) diagnostics.push(`settings.json: delegate.agents.${name} does not match a discovered agent`);
  }

  const agents = discovery.agents.map((agent): TaskAgent => {
    const override = configuration.agents.get(agent.name);
    if (!override) return agent;
    return {
      ...agent,
      model: override.model === null ? undefined : override.model ?? agent.model,
      thinking: override.thinking ?? agent.thinking,
    };
  });
  return { ...discovery, agents, diagnostics };
}

