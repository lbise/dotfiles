const CHILD_BUILTIN_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);

export function intersectTools(parentTools: readonly string[], agentTools?: readonly string[]): string[] {
  if (!agentTools) return [...parentTools];
  const allowed = new Set(agentTools);
  return parentTools.filter((tool) => allowed.has(tool));
}

export function childToolAllowlist(parentTools: readonly string[], agentTools?: readonly string[]): string[] {
  return intersectTools(parentTools, agentTools).filter((tool) => CHILD_BUILTIN_TOOLS.has(tool));
}
