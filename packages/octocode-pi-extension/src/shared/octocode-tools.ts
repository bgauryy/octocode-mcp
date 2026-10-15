/** The MCP server name this extension registers Octocode under (and looks for in Pi's `mcp.json`). */
export const OCTOCODE_SERVER = 'octocode';

/** Pi names the tools of an MCP server it runs `mcp__<server>__<tool>`. */
const MCP_TOOL_PREFIX = 'mcp__';

/** Whether `name` is a tool of some MCP server. */
export const isMcpTool = (name: string): boolean => name.startsWith(MCP_TOOL_PREFIX);

/** Octocode's tools are the ones of the server `OCTOCODE_SERVER`. */
export const OCTOCODE_TOOL_PREFIX = `${MCP_TOOL_PREFIX}${OCTOCODE_SERVER}__`;

/** Whether `name` is an Octocode MCP tool. */
export const isOctocodeTool = (name: string): boolean => name.startsWith(OCTOCODE_TOOL_PREFIX);
