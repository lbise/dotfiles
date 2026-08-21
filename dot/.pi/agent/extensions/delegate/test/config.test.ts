import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDiscovery } from "../agents.ts";
import { configureAgents, parseDelegateConfiguration } from "../config.ts";

function discovery(): AgentDiscovery {
  return {
    agents: [
      {
        name: "explore",
        description: "Explore",
        prompt: "Inspect",
        model: "anthropic/file-model",
        thinking: "low",
        hidden: false,
        source: "packaged",
        filePath: "/agents/explore.md",
      },
      {
        name: "general",
        description: "General",
        prompt: "Work",
        hidden: false,
        source: "packaged",
        filePath: "/agents/general.md",
      },
    ],
    diagnostics: [],
  };
}

test("delegate settings choose a model independently for each agent", () => {
  const configuration = parseDelegateConfiguration({
    delegate: {
      agents: {
        explore: { model: "parent" },
        general: { model: "github-copilot/gpt-5.6-terra", thinking: "medium" },
      },
    },
  });
  const configured = configureAgents(discovery(), configuration);

  assert.equal(configured.agents[0].model, undefined);
  assert.equal(configured.agents[0].thinking, "low");
  assert.equal(configured.agents[1].model, "github-copilot/gpt-5.6-terra");
  assert.equal(configured.agents[1].thinking, "medium");
  assert.deepEqual(configured.diagnostics, []);
});

test("project delegate settings merge with global settings by agent and field", () => {
  const configuration = parseDelegateConfiguration(
    {
      delegate: {
        agents: {
          explore: { model: "anthropic/claude-haiku", thinking: "low" },
          general: { model: "parent" },
        },
      },
    },
    {
      delegate: {
        agents: {
          explore: { thinking: "high" },
        },
      },
    },
  );

  assert.equal(configuration.agents.get("explore")?.model, "anthropic/claude-haiku");
  assert.equal(configuration.agents.get("explore")?.thinking, "high");
  assert.equal(configuration.agents.get("general")?.model, null);
});

test("invalid delegate settings produce diagnostics without changing agent files", () => {
  const configuration = parseDelegateConfiguration({
    delegate: {
      agents: {
        explore: { model: "missing-provider", thinking: "extreme" },
        absent: { model: "parent" },
      },
    },
  });
  const configured = configureAgents(discovery(), configuration);

  assert.equal(configured.agents[0].model, "anthropic/file-model");
  assert.equal(configured.agents[0].thinking, "low");
  assert.equal(configured.diagnostics.some((message) => message.includes("explore.model")), true);
  assert.equal(configured.diagnostics.some((message) => message.includes("explore.thinking")), true);
  assert.equal(configured.diagnostics.some((message) => message.includes("absent") && message.includes("discovered")), true);
});
