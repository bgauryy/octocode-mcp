import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { BulkRipgrepQuerySchema, LOCAL_RIPGREP_DESCRIPTION } from './scheme.js';
import { executeRipgrepSearch } from './execution.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';
import { LocalSearchCodeOutputSchema } from '../../scheme/outputSchemas.js';

/**
 * Register the local ripgrep search tool with the MCP server.
 * Follows the same pattern as GitHub tools for consistency.
 */
export function registerLocalRipgrepTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.LOCAL_RIPGREP,
    {
      description: LOCAL_RIPGREP_DESCRIPTION,
      inputSchema: BulkRipgrepQuerySchema as unknown as AnySchema,
      outputSchema: LocalSearchCodeOutputSchema as unknown as AnySchema,
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
