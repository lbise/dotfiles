import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";

import { parseDelegateConfiguration, type DelegateConfiguration } from "./config.ts";

export function loadDelegateConfiguration(
  cwd: string,
  projectTrusted: boolean,
  agentDir = process.env.PI_CODING_AGENT_DIR ?? getAgentDir(),
): DelegateConfiguration {
  const settings = SettingsManager.create(cwd, agentDir, { projectTrusted });
  const configuration = parseDelegateConfiguration(
    settings.getGlobalSettings(),
    settings.getProjectSettings(),
  );
  for (const error of settings.drainErrors()) {
    configuration.diagnostics.push(`${error.scope} settings.json: ${error.error.message}`);
  }
  return configuration;
}
