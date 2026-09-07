export const OCTOCODE_COMPACT_MCP_ENV = "OCTOCODE_COMPACT_MCP";
export const OCTOCODE_MCP_AI_GUIDE_ENV = "OCTOCODE_MCP_AI_GUIDE";

export function isCompactMcpEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env[OCTOCODE_COMPACT_MCP_ENV]?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "no" && value !== "off";
}

export function isMcpAiGuideEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[OCTOCODE_MCP_AI_GUIDE_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}
