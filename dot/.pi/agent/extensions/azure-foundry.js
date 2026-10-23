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
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";

const FALLBACK = { reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 };

/** Route a deployment to one of pi's built-in API implementations, with metadata from pi's catalog. */
function deploymentToModel(d, host) {
    const modelName = d.modelName ?? d.name;
    const route = d.modelPublisher === "Anthropic"
        ? { api: "anthropic-messages", baseUrl: `${host}/anthropic`, catalogs: ["anthropic"] }
        : d.modelPublisher === "OpenAI"
            ? { api: "azure-openai-responses", baseUrl: `${host}/openai/v1`, catalogs: ["azure", "openai"] }
            // shortcut: other publishers (Kimi, Llama, ...) untested on Foundry's OpenAI-compatible v1 route; verify when one is deployed.
            : { api: "openai-completions", baseUrl: `${host}/openai/v1`, catalogs: [] };
    const c = route.catalogs.map((p) => getBuiltinModel(p, modelName)).find(Boolean);
    if (!c)
        console.log(`[Azure Foundry] ${d.name}: "${modelName}" not in pi's catalog, using generic limits`);
    const meta = c
        ? { reasoning: c.reasoning, input: c.input, cost: c.cost, contextWindow: c.contextWindow, maxTokens: c.maxTokens,
            thinkingLevelMap: c.thinkingLevelMap, compat: c.compat, promptCache: c.promptCache, inputLimits: c.inputLimits }
        : FALLBACK;
    return { id: d.name, name: `${c?.name ?? modelName} (Azure)`, api: route.api, baseUrl: route.baseUrl, ...meta };
}

export default async function (pi) {
    // shortcut: api-key auth only; pi's built-in Anthropic/Azure clients take a static key.
    // Entra ID login needs a token-refreshing provider; add it if that auth is ever needed.
    const { AZURE_FOUNDRY_RESOURCE: resource, AZURE_FOUNDRY_PROJECT: project, AZURE_FOUNDRY_API_KEY: apiKey } = process.env;
    if (!resource || !project || !apiKey) {
        console.warn("[Azure Foundry] Set AZURE_FOUNDRY_RESOURCE, AZURE_FOUNDRY_PROJECT and AZURE_FOUNDRY_API_KEY to enable the provider");
        return;
    }
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
        apiKey: "$AZURE_FOUNDRY_API_KEY",
        models: deployments.map((d) => deploymentToModel(d, host)),
    });
    console.log(`[Azure Foundry] ✓ Registered ${deployments.length} model(s): ${deployments.map((d) => d.name).join(", ")}`);
}
