// Lets `node --test` import Pi's packages (`@earendil-works/*`, `typebox`) from the managed install.
// Usage: node --import ./delegate/test/pi-resolve.mjs --test delegate/test/*.test.ts
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(process.env.HOME ?? "", ".pi", "agent");
const version = readFileSync(join(agentDir, "install", "current-version"), "utf8").trim();
const parentURL = pathToFileURL(join(agentDir, "install", "releases", version, "node_modules", "_")).href;

register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); }
      catch (error) {
        if (error?.code !== "ERR_MODULE_NOT_FOUND" || specifier.startsWith(".") || specifier.startsWith("/")) throw error;
        return next(specifier, { ...context, parentURL: ${JSON.stringify(parentURL)} });
      }
    }
  `)}`,
  import.meta.url,
);
