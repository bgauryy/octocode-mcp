/** The MCP server name this extension registers Octocode under (and looks for in Pi's `mcp.json`). */
export const OCTOCODE_SERVER = 'octocode';

/** Octocode tools are named `mcp__<server>__<tool>`, as Pi names tools of an MCP server it runs. */
export const OCTOCODE_TOOL_PREFIX = `mcp__${OCTOCODE_SERVER}__`;

/** Whether `name` is an Octocode MCP tool. */
export const isOctocodeTool = (name: string): boolean => name.startsWith(OCTOCODE_TOOL_PREFIX);
