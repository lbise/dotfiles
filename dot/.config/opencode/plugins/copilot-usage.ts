import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

type AuthEntry = {
  access?: string
}

type AuthFile = Record<string, AuthEntry>

type QuotaSnapshot = {
  percent_remaining?: number
  quota_remaining?: number
  remaining?: number
  entitlement?: number
  unlimited?: boolean
}

type CopilotUserInfo = {
  copilot_plan?: string
  quota_reset_date_utc?: string
  endpoints?: {
    api?: string
  }
  quota_snapshots?: {
    premium_interactions?: QuotaSnapshot
    chat?: QuotaSnapshot
    completions?: QuotaSnapshot
  }
}

type CopilotTokenEnvelope = {
  token?: string
  endpoints?: {
    api?: string
    proxy?: string
  }
}

type CopilotTokenPriceTier = {
  input_price?: number
  cache_price?: number
  output_price?: number
  context_max?: number
  inputPrice?: number
  cachePrice?: number
  outputPrice?: number
  contextMax?: number
}

type CopilotTokenPrices = {
  input_price?: number
  cache_price?: number
  output_price?: number
  inputPrice?: number
  cachePrice?: number
  outputPrice?: number
  default?: CopilotTokenPriceTier
  long_context?: CopilotTokenPriceTier
  longContext?: CopilotTokenPriceTier
}

type CopilotModel = {
  id?: string
  name?: string
  capabilities?: {
    limits?: {
      max_context_window_tokens?: number
      max_prompt_tokens?: number
      max_output_tokens?: number
    }
  }
  billing?: {
    is_premium?: boolean
    multiplier?: number
    restricted_to?: string[]
    token_prices?: CopilotTokenPrices
    tokenPricing?: CopilotTokenPrices
  }
  model_picker_price_category?: string
  warning_message?: string
  warning_messages?: { message?: string }[]
}

type UsageSnapshot = {
  key: string
  line: string
  fetchedAt: number
}

type ModelMetadataResult = {
  models: CopilotModel[]
  source: string
  pricingAvailable: boolean
}

type SessionModel = {
  id: string
  providerID?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const GITHUB_API_BASE = "https://api.github.com"
const CAPI_BASE = "https://api.githubcopilot.com"

function authPaths() {
  const home = homedir()
  const stateHome = process.env.XDG_STATE_HOME || join(home, ".local", "share")
  const configHome = process.env.XDG_CONFIG_HOME || join(home, ".config")
  return [join(stateHome, "opencode", "auth.json"), join(configHome, "opencode", "auth.json")]
}

async function readAuth(): Promise<AuthFile | null> {
  for (const filePath of authPaths()) {
    try {
      const raw = await readFile(filePath, "utf8")
      return JSON.parse(raw) as AuthFile
    } catch {
      continue
    }
  }

  return null
}

function formatNumber(value: number | undefined): string | null {
  if (typeof value !== "number") return null
  return new Intl.NumberFormat().format(Math.floor(value))
}

function formatUsedPercent(value: number | undefined): string | null {
  if (typeof value !== "number") return null
  return `${(100 - value).toFixed(1)}% used`
}

function formatResetDate(value: string | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed)
}

function normalizeModelID(modelID: string): string {
  const parts = modelID.split("/")
  return parts[parts.length - 1] || modelID
}

function isGitHubCopilotModel(model: SessionModel | undefined): model is SessionModel {
  return model?.providerID === "github-copilot" || model?.id.startsWith("github-copilot/") === true
}

function formatCost(value: number | undefined): string | null {
  if (typeof value !== "number") return null
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
}

function tokenPrices(model: CopilotModel): CopilotTokenPrices | undefined {
  return model.billing?.token_prices || model.billing?.tokenPricing
}

function tierValue(tier: CopilotTokenPriceTier | undefined, snake: keyof CopilotTokenPriceTier, camel: keyof CopilotTokenPriceTier): number | undefined {
  const value = tier?.[snake] ?? tier?.[camel]
  return typeof value === "number" ? value : undefined
}

function describeTokenPrices(model: CopilotModel): string | null {
  const prices = tokenPrices(model)
  if (!prices) return null

  const defaults = prices.default || prices
  const input = formatCost(tierValue(defaults, "input_price", "inputPrice"))
  const cache = formatCost(tierValue(defaults, "cache_price", "cachePrice"))
  const output = formatCost(tierValue(defaults, "output_price", "outputPrice"))
  const parts: string[] = []
  if (input) parts.push(`in ${input}`)
  if (cache) parts.push(`cache ${cache}`)
  if (output) parts.push(`out ${output}`)

  const longContext = prices.long_context || prices.longContext
  const longInput = formatCost(tierValue(longContext, "input_price", "inputPrice"))
  const longCache = formatCost(tierValue(longContext, "cache_price", "cachePrice"))
  const longOutput = formatCost(tierValue(longContext, "output_price", "outputPrice"))
  const longParts: string[] = []
  if (longInput) longParts.push(`in ${longInput}`)
  if (longCache) longParts.push(`cache ${longCache}`)
  if (longOutput) longParts.push(`out ${longOutput}`)

  if (longParts.length > 0) parts.push(`long ${longParts.join("/")}`)
  return parts.length > 0 ? `${parts.join("/")} credits per 1M tokens` : null
}

function hasTokenPrices(model: CopilotModel): boolean {
  return describeTokenPrices(model) !== null
}

function describeCurrentModel(modelID: string | undefined, models: CopilotModel[]): string | null {
  if (!modelID) return null
  const normalizedModelID = normalizeModelID(modelID)
  const model = models.find((item) => item.id === modelID || item.id === normalizedModelID)
  if (!model) return null

  const details: string[] = []
  if (model.billing?.is_premium === true) details.push("premium")
  if (model.billing?.is_premium === false) details.push("standard")
  if (typeof model.billing?.multiplier === "number") details.push(`x${model.billing.multiplier}`)
  const pricing = describeTokenPrices(model)
  if (pricing) details.push(pricing)

  const context = formatNumber(model.capabilities?.limits?.max_context_window_tokens)
  const prompt = formatNumber(model.capabilities?.limits?.max_prompt_tokens)
  const output = formatNumber(model.capabilities?.limits?.max_output_tokens)
  if (context) details.push(`ctx ${context}`)
  if (prompt) details.push(`in ${prompt}`)
  if (output) details.push(`out ${output}`)

  if (details.length === 0) return model.name || model.id || modelID
  return `${model.name || model.id || modelID}: ${details.join(" | ")}`
}

function describeModelLine(model: CopilotModel): string {
  const parts = [model.name || model.id || "unknown"]
  if (model.id && model.name && model.id !== model.name) parts.push(`id=${model.id}`)
  if (model.billing?.is_premium === true) parts.push("premium")
  if (model.billing?.is_premium === false) parts.push("standard")
  if (typeof model.billing?.multiplier === "number") parts.push(`multiplier x${model.billing.multiplier}`)

  const pricing = describeTokenPrices(model)
  if (pricing) parts.push(pricing)
  if (model.model_picker_price_category) parts.push(`price_category=${model.model_picker_price_category}`)

  if (model.capabilities?.limits?.max_context_window_tokens) {
    parts.push(`ctx=${formatNumber(model.capabilities.limits.max_context_window_tokens)}`)
  }
  if (model.capabilities?.limits?.max_prompt_tokens) {
    parts.push(`input_limit=${formatNumber(model.capabilities.limits.max_prompt_tokens)}`)
  }
  if (model.capabilities?.limits?.max_output_tokens) {
    parts.push(`output_limit=${formatNumber(model.capabilities.limits.max_output_tokens)}`)
  }
  if (model.billing?.restricted_to?.length) parts.push(`restricted_to=${model.billing.restricted_to.join(",")}`)
  if (model.warning_message) parts.push(`note=${model.warning_message}`)
  for (const warning of model.warning_messages || []) {
    if (warning.message) parts.push(`note=${warning.message}`)
  }

  return parts.join(" | ")
}

async function buildModelCostsOutput(): Promise<string> {
  const auth = await readAuth()
  const token = auth?.["github-copilot"]?.access || auth?.github?.access
  if (!token) return "GitHub Copilot auth not found"

  const info = (await fetchJSON(`${GITHUB_API_BASE}/copilot_internal/user`, token)) as CopilotUserInfo
  const metadata = await fetchCopilotModels(token, info.endpoints?.api)
  if (metadata.models.length === 0) return "No Copilot model metadata available"

  const header = [
    `Source: ${metadata.source}`,
    `Models: ${metadata.models.length}`,
    metadata.pricingAvailable
      ? "Token prices: available where listed below"
      : "Token prices: unavailable from accessible token path; showing premium multipliers and context limits",
  ]

  return `${header.join("\n")}\n\n${metadata.models.map(describeModelLine).join("\n")}`
}

function buildUsageLine(info: CopilotUserInfo): string {
  const premium = info.quota_snapshots?.premium_interactions
  const remaining = formatNumber(premium?.remaining ?? premium?.quota_remaining)
  const entitlement = formatNumber(premium?.entitlement)
  const used = formatUsedPercent(premium?.percent_remaining)
  const reset = formatResetDate(info.quota_reset_date_utc)
  const plan = info.copilot_plan || "copilot"

  if (premium?.unlimited) {
    return `Copilot: premium unlimited${reset ? ` | reset ${reset}` : ""}`
  }

  if (remaining && entitlement) {
    return `Copilot: ${used ? `**${used}**` : "usage unavailable"} (${remaining}/${entitlement} left)${reset ? ` | reset ${reset}` : ""}`
  }

  if (used) {
    return `Copilot: **${used}**${reset ? ` | reset ${reset}` : ""}`
  }

  return `Copilot: ${plan}${reset ? ` | reset ${reset}` : ""}`
}

async function fetchJSON(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Editor-Version": "vscode/1.105.0",
      "Editor-Plugin-Version": "copilot-chat/0.32.4",
      "User-Agent": "GitHubCopilotChat/0.35.0",
      "Copilot-Integration-Id": "vscode-chat",
    },
  })

  if (!response.ok) {
    throw new Error(String(response.status))
  }

  return response.json()
}

async function fetchGitHubJSON(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/json",
      "X-GitHub-Api-Version": "2025-04-01",
    },
  })

  if (!response.ok) {
    throw new Error(String(response.status))
  }

  return response.json()
}

async function fetchCAPIJSON(url: string, token: string, integrationID: string, deviceID = randomUUID()): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-GitHub-Api-Version": "2026-06-01",
      "VScode-SessionId": randomUUID(),
      "VScode-MachineId": randomUUID(),
      "Editor-Device-Id": deviceID,
      "Editor-Plugin-Version": "copilot-chat/0.51.2",
      "Editor-Version": "vscode/1.123.2",
      "Copilot-Integration-Id": integrationID,
    },
  })

  if (!response.ok) {
    throw new Error(String(response.status))
  }

  return response.json()
}

function parseSessionModel(value: unknown): SessionModel | undefined {
  if (typeof value === "string") {
    try {
      return parseSessionModel(JSON.parse(value))
    } catch {
      if (!value) return undefined
      const [providerID, ...idParts] = value.split("/")
      return idParts.length > 0 ? { id: idParts.join("/"), providerID } : { id: value }
    }
  }

  if (!value || typeof value !== "object") return undefined
  const item = value as { id?: unknown; modelID?: unknown; providerID?: unknown }
  const id = typeof item.id === "string" ? item.id : typeof item.modelID === "string" ? item.modelID : undefined
  const providerID = typeof item.providerID === "string" ? item.providerID : undefined
  return id ? { id, providerID } : undefined
}

async function readCurrentSessionModel(client: { session: { get: (options: { path: { id: string } }) => Promise<{ data?: { modelID?: string; model?: unknown } }> } }, sessionID: string): Promise<SessionModel | undefined> {
  try {
    const result = await client.session.get({ path: { id: sessionID } })
    const session = result.data
    return parseSessionModel(session?.model) || parseSessionModel(session?.modelID)
  } catch {
    return undefined
  }
}

async function fetchDirectCopilotModels(token: string, apiBase?: string): Promise<CopilotModel[]> {
  if (!apiBase) return []
  try {
    const response = (await fetchJSON(`${apiBase}/models`, token)) as { data?: CopilotModel[] } | CopilotModel[]
    return Array.isArray(response) ? response : Array.isArray(response.data) ? response.data : []
  } catch {
    return []
  }
}

async function fetchCopilotTokenFromGitHubToken(token: string): Promise<CopilotTokenEnvelope | null> {
  try {
    const response = (await fetchGitHubJSON(`${GITHUB_API_BASE}/copilot_internal/v2/token`, token)) as CopilotTokenEnvelope
    return response.token ? response : null
  } catch {
    return null
  }
}

async function fetchNoAuthCopilotToken(): Promise<{ envelope: CopilotTokenEnvelope; deviceID: string } | null> {
  const deviceID = randomUUID()
  try {
    const response = await fetch(`${GITHUB_API_BASE}/copilot_internal/v2/nltoken`, {
      headers: {
        Accept: "application/json",
        "X-GitHub-Api-Version": "2025-04-01",
        "Editor-Device-Id": deviceID,
      },
    })
    if (!response.ok) return null
    const envelope = (await response.json()) as CopilotTokenEnvelope
    return envelope.token ? { envelope, deviceID } : null
  } catch {
    return null
  }
}

async function fetchCAPIModels(envelope: CopilotTokenEnvelope, integrationID: string, deviceID?: string): Promise<CopilotModel[]> {
  if (!envelope.token) return []
  const apiBase = envelope.endpoints?.api || CAPI_BASE
  try {
    const response = (await fetchCAPIJSON(`${apiBase}/models`, envelope.token, integrationID, deviceID)) as { data?: CopilotModel[] } | CopilotModel[]
    return Array.isArray(response) ? response : Array.isArray(response.data) ? response.data : []
  } catch {
    return []
  }
}

function mergeModels(primary: CopilotModel[], fallback: CopilotModel[]): CopilotModel[] {
  const merged = new Map<string, CopilotModel>()
  for (const model of fallback) {
    if (model.id) merged.set(model.id, model)
  }
  for (const model of primary) {
    if (model.id) merged.set(model.id, model)
  }
  return Array.from(merged.values())
}

async function fetchCopilotModels(token: string, apiBase?: string): Promise<ModelMetadataResult> {
  const copilotToken = await fetchCopilotTokenFromGitHubToken(token)
  if (copilotToken) {
    const models = await fetchCAPIModels(copilotToken, "vscode-chat")
    if (models.length > 0) {
      return { models, source: "authenticated CAPI", pricingAvailable: models.some(hasTokenPrices) }
    }
  }

  const directModels = await fetchDirectCopilotModels(token, apiBase)
  const noAuthToken = await fetchNoAuthCopilotToken()
  const noAuthModels = noAuthToken ? await fetchCAPIModels(noAuthToken.envelope, "vscode-nl", noAuthToken.deviceID) : []
  const mergedModels = mergeModels(directModels, noAuthModels)

  if (mergedModels.length > 0) {
    const source = [directModels.length > 0 ? "direct API" : null, noAuthModels.length > 0 ? "no-auth CAPI" : null].filter(Boolean).join(" + ")
    return { models: mergedModels, source, pricingAvailable: mergedModels.some(hasTokenPrices) }
  }

  return { models: [], source: "none", pricingAvailable: false }
}

async function fetchUsageLine(currentModelID: string): Promise<string> {
  const auth = await readAuth()
  const token = auth?.["github-copilot"]?.access || auth?.github?.access
  if (!token) return "Copilot usage unavailable (missing GitHub auth)"

  try {
    const data = (await fetchJSON("https://api.github.com/copilot_internal/user", token)) as CopilotUserInfo
    const metadata = await fetchCopilotModels(token, data.endpoints?.api)
    const currentModel = describeCurrentModel(currentModelID, metadata.models)
    const usage = buildUsageLine(data)
    return currentModel ? `${usage} | model ${currentModel}` : usage
  } catch {
    return "Copilot usage unavailable (request failed)"
  }
}

export const CopilotUsagePlugin: Plugin = async ({ client }) => {
  let cached: UsageSnapshot | undefined
  const processedParts = new Set<string>()

  return {
    tool: {
      copilot_model_costs: tool({
        description: "Lists GitHub Copilot model billing metadata available locally",
        args: {},
        execute: buildModelCostsOutput,
      }),
    },
    "experimental.text.complete": async (input, output) => {
      const processedKey = `${input.messageID}:${input.partID}`
      if (processedParts.has(processedKey)) return

      const { data: message } = await client.session.message({
        path: {
          id: input.sessionID,
          messageID: input.messageID,
        },
      })

      if (!message || message.info.role !== "assistant") return

      const partIndex = message.parts.findIndex((part) => part.id === input.partID)
      if (partIndex < 0) return
      if (partIndex !== message.parts.length - 1) return
      if (message.parts[partIndex]?.type !== "text") return

      const currentModel = await readCurrentSessionModel(client, input.sessionID)
      if (!isGitHubCopilotModel(currentModel)) {
        processedParts.add(processedKey)
        return
      }

      const now = Date.now()
      const cacheKey = `${input.sessionID}:${currentModel.providerID || ""}/${currentModel.id}`
      if (!cached || cached.key !== cacheKey || now - cached.fetchedAt > CACHE_TTL_MS) {
        cached = {
          key: cacheKey,
          line: await fetchUsageLine(currentModel.id),
          fetchedAt: now,
        }
      }

      output.text += `\n\n${cached.line}`
      processedParts.add(processedKey)
    },
  }
}

export const CopilotModelCostsPlugin: Plugin = async () => {
  return {
    tool: {
      copilot_model_costs: tool({
        description: "Lists GitHub Copilot model billing metadata available locally",
        args: {},
        execute: buildModelCostsOutput,
      }),
    },
  }
}

export default CopilotUsagePlugin
