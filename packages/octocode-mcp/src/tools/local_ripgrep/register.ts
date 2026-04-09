import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toMCPSchema } from '../../types/toolTypes.js';
import { TOOL_NAMES } from '@octocodeai/octocode-core';
import { BulkRipgrepQuerySchema, LOCAL_RIPGREP_DESCRIPTION } from '@octocodeai/octocode-core';
import { executeRipgrepSearch } from './execution.js';
import { withBasicSecurityValidation } from '../../utils/securityBridge.js';
import { LocalSearchCodeOutputSchema } from '@octocodeai/octocode-core';

/**
 * Register the local ripgrep search tool with the MCP server.
 * Follows the same pattern as GitHub tools for consistency.
 */
export function registerLocalRipgrepTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.LOCAL_RIPGREP,
    {
      description: LOCAL_RIPGREP_DESCRIPTION,
      inputSchema: toMCPSchema(BulkRipgrepQuerySchema),
      outputSchema: toMCPSchema(LocalSearchCodeOutputSchema),
      annotations: {
        title: 'Local Ripgrep Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withBasicSecurityValidation(executeRipgrepSearch, TOOL_NAMES.LOCAL_RIPGREP)
  );
}
