// Adapted from @nquandt/pi-azure-foundry 1.0.3 (https://github.com/nquandt/pi-azure-foundry).
// Rewritten to discover Foundry deployments and delegate requests to pi's built-in
// Anthropic Messages / Azure OpenAI Responses implementations (thinking, images, caching).
/*
MIT License

Copyright (c) 2025 Nicholas Quandt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const CREDENTIALS = ["AZURE_FOUNDRY_RESOURCE", "AZURE_FOUNDRY_PROJECT", "AZURE_FOUNDRY_API_KEY"];

/** Each credential from its env var, else the Vault agent folder, via the ai-skills helper redmine_cli.py also uses. */
async function credentials() {
    if (CREDENTIALS.every((n) => process.env[n]))
        return Object.fromEntries(CREDENTIALS.map((n) => [n, process.env[n]]));
    const script = "import json, sys; sys.path.append(sys.argv[1]); from vault_secrets import get_credential; "
        + "print(json.dumps({n: get_credential(n, required=False) for n in sys.argv[2:]}))";
    const helper = join(homedir(), "gitrepo/ai-skills/skills/vault-secrets");
    try {
        const { stdout } = await promisify(execFile)("python3", ["-c", script, helper, ...CREDENTIALS], { timeout: 15000 });
        return JSON.parse(stdout);
    }
    catch {
        return {}; // no python, no helper, or Vault unreachable: same as unset
    }
}

const FALLBACK = { reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 };

/** Exact catalog entry, else the newest sibling of the same family (claude-fable-5-2 -> claude-fable-5-1).
 * shortcut: a deployment newer than pi's catalog borrows its predecessor's limits/compat; exact match wins once pi is updated. */
export function catalogModel(provider, id) {
    const models = getBuiltinModels(provider);
    const exact = models.find((m) => m.id === id);
    const family = id.replace(/-\d+$/, "");
    if (exact || family === id)
        return exact;
    return models.filter((m) => m.id === family || m.id.startsWith(`${family}-`))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).at(-1);
}

/** Route a deployment to one of pi's built-in API implementations, with metadata from pi's catalog. */
function deploymentToModel(d, host) {
    const modelName = d.modelName ?? d.name;
    const route = d.modelPublisher === "Anthropic"
        ? { api: "anthropic-messages", baseUrl: `${host}/anthropic`, catalogs: ["anthropic"] }
        : d.modelPublisher === "OpenAI"
            ? { api: "azure-openai-responses", baseUrl: `${host}/openai/v1`, catalogs: ["azure", "openai"] }
            // shortcut: other publishers (Kimi, Llama, ...) untested on Foundry's OpenAI-compatible v1 route; verify when one is deployed.
            : { api: "openai-completions", baseUrl: `${host}/openai/v1`, catalogs: [] };
    const c = route.catalogs.map((p) => catalogModel(p, modelName)).find(Boolean);
    if (!c)
        console.log(`[Azure Foundry] ${d.name}: "${modelName}" not in pi's catalog, using generic limits`);
    else if (c.id !== modelName)
        console.log(`[Azure Foundry] ${d.name}: "${modelName}" not in pi's catalog, using ${c.id} metadata`);
    // Foundry rejects Anthropic's server-side `fallbacks` request field, so drop the compat entry that enables it.
    const { allowedFallbackModels, ...compat } = c?.compat ?? {};
    const meta = c
        ? { reasoning: c.reasoning, input: c.input, cost: c.cost, contextWindow: c.contextWindow, maxTokens: c.maxTokens,
            thinkingLevelMap: c.thinkingLevelMap, compat: c.compat && compat, promptCache: c.promptCache, inputLimits: c.inputLimits }
        : FALLBACK;
    return { id: d.name, name: `${c?.id === modelName ? c.name : modelName} (Azure)`, api: route.api, baseUrl: route.baseUrl, ...meta };
}

export default async function (pi) {
    // shortcut: api-key auth only; pi's built-in Anthropic/Azure clients take a static key.
    // Entra ID login needs a token-refreshing provider; add it if that auth is ever needed.
    const { AZURE_FOUNDRY_RESOURCE: resource, AZURE_FOUNDRY_PROJECT: project, AZURE_FOUNDRY_API_KEY: apiKey } = await credentials();
    if (!resource || !project || !apiKey)
        return; // not configured on this machine: stay silent
    const host = `https://${resource}.services.ai.azure.com`;
    const url = `${host}/api/projects/${project}/deployments?api-version=v1`;
    let deployments;
    try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!response.ok)
            throw new Error(`${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
        deployments = ((await response.json()).value ?? []).filter((d) => d.capabilities?.chat_completion === "true");
    }
    catch (error) {
        // Don't take pi down when Foundry is unreachable or misconfigured; just skip the provider.
        console.warn(`[Azure Foundry] Deployment discovery failed (${url}): ${error instanceof Error ? error.message : error}`);
        return;
    }
    if (deployments.length === 0) {
        console.warn("[Azure Foundry] No chat-capable deployments found");
        return;
    }
    pi.registerProvider("azure-foundry", {
        name: "Azure Foundry",
        baseUrl: host,
        // Literal key (Vault values are not in the env); escape pi's `$VAR` / `!command` syntax.
        apiKey: apiKey.replace(/[$!]/g, "$$$&"),
        models: deployments.map((d) => deploymentToModel(d, host)),
    });
    console.log(`[Azure Foundry] ✓ Registered ${deployments.length} model(s): ${deployments.map((d) => d.name).join(", ")}`);
    // Foundry doesn't apply pi's `thinking.block_binding: drop_block` (thinking-binding-controls beta), so
    // after a compaction or branch summary, thinking blocks bound to the replaced prefix get a 400.
    pi.on("context", (event, ctx) => {
        const m = ctx.model;
        if (m?.provider !== "azure-foundry" || m.api !== "anthropic-messages")
            return;
        const messages = dropUnboundThinking(event.messages);
        return messages === event.messages ? undefined : { messages };
    });
}

/** Drop thinking from assistant messages created before a summary that now precedes them (their prefix changed). */
export function dropUnboundThinking(messages) {
    let summaryTime = -Infinity;
    let changed = false;
    const out = messages.map((msg) => {
        if (msg.role === "compactionSummary" || msg.role === "branchSummary")
            summaryTime = Math.max(summaryTime, msg.timestamp);
        if (msg.role !== "assistant" || msg.timestamp >= summaryTime || !msg.content.some((b) => b.type === "thinking"))
            return msg;
        changed = true;
        return { ...msg, content: msg.content.filter((b) => b.type !== "thinking") };
    });
    return changed ? out : messages;
}
