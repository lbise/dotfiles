// The subscriptions' current limits, as Pi's usage extension reads them
// (~/.pi/agent/extensions/usage), so the API calls live in one place.
// The usage mod runs it on a machine (node --input-type=module -e) and reads one JSON object:
//   {"providers": [{id, name, extraLabel, snapshot} | {id, name, error}]}
// It uses the tokens in Pi's auth.json as they are: an expired one is reported,
// not refreshed (Pi refreshes it the next time it runs there).
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const agent = join(homedir(), ".pi", "agent");
const load = (file) => import(pathToFileURL(join(agent, "extensions", "usage", "providers", file)).href);
const json = async (file) => JSON.parse(await readFile(join(agent, file), "utf8").catch(() => "{}"));

const entries = await json("auth.json");
const settings = await json("settings.json");
const auth = {
  async apiKey(provider) {
    const entry = entries[provider];
    if (entry?.expires && entry.expires < Date.now()) throw new Error("token expired, run pi here");
    return entry?.access;
  },
  async authEntry(provider) {
    return entries[provider];
  },
};

const [{ codexProvider }, { anthropicProvider }, copilot] = await Promise.all(
  ["codex.ts", "anthropic.ts", "copilot.ts"].map(load),
);
copilot.setCopilotCreditCap(settings.usage?.copilotCreditCap);

const providers = await Promise.all(
  [copilot.copilotProvider, codexProvider, anthropicProvider].map(async (p) => {
    const base = { id: p.id, name: p.name, extraLabel: p.extraLabel };
    if (!entries[p.id]) return { ...base, error: "not logged in" };
    try {
      return { ...base, snapshot: await p.fetchUsage(auth) };
    } catch (error) {
      return { ...base, error: String(error?.message || error) };
    }
  }),
);
process.stdout.write(JSON.stringify({ providers }));
