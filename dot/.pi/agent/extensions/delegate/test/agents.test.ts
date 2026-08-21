import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { discoverAgents } from "../agents.ts";

function write(dir: string, name: string, content: string) {
  writeFileSync(join(dir, name), content);
}

test("discoverAgents layers packaged, user, and trusted project definitions", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-delegate-agents-"));
  const packaged = join(root, "packaged");
  const user = join(root, "user");
  const project = join(root, "project");
  const projectAgents = join(project, ".pi", "agents");
  try {
    for (const dir of [packaged, user, projectAgents]) {
      mkdirSync(dir, { recursive: true });
    }
    write(packaged, "general.md", "---\ndescription: packaged general\n---\npackaged");
    write(packaged, "explore.md", "---\ndescription: packaged explore\ntools: read, grep\n---\nexplore");
    write(user, "general.md", "---\ndescription: user general\n---\nuser");
    write(projectAgents, "review.md", "---\n# Project-owned agent\ndescription: \"Project review: no edits\"\n\ntools: [\"read\", \"grep\"]\n---\nreview");

    const untrusted = discoverAgents({ packagedDir: packaged, userDir: user, cwd: project, projectTrusted: false });
    assert.equal(untrusted.agents.find((agent) => agent.name === "general")?.source, "user");
    assert.equal(untrusted.agents.some((agent) => agent.name === "review"), false);

    const trusted = discoverAgents({ packagedDir: packaged, userDir: user, cwd: project, projectTrusted: true });
    assert.equal(trusted.agents.find((agent) => agent.name === "review")?.source, "project");
    assert.equal(trusted.agents.find((agent) => agent.name === "review")?.description, "Project review: no edits");
    assert.deepEqual(trusted.agents.find((agent) => agent.name === "review")?.tools, ["read", "grep"]);
    assert.deepEqual(trusted.agents.find((agent) => agent.name === "explore")?.tools, ["read", "grep"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverAgents supports disables and retains malformed-file diagnostics", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-delegate-agents-"));
  const packaged = join(root, "packaged");
  const user = join(root, "user");
  try {
    mkdirSync(packaged, { recursive: true });
    mkdirSync(user, { recursive: true });
    write(packaged, "general.md", "---\ndescription: packaged general\n---\npackaged");
    write(user, "general.md", "---\ndisabled: true\n---\n");
    write(user, "broken.md", "---\ndescription: broken agent\ntools: 12\n---\nbroken");
    const result = discoverAgents({ packagedDir: packaged, userDir: user, cwd: root, projectTrusted: false });
    assert.equal(result.agents.some((agent) => agent.name === "general"), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.includes("broken.md")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
