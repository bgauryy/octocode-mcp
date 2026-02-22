import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import {
  BulkViewStructureSchema,
  LOCAL_VIEW_STRUCTURE_DESCRIPTION,
} from './scheme.js';
import { executeViewStructure } from './execution.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';
import { LocalViewStructureOutputSchema } from '../../scheme/outputSchemas.js';

/**
 * Register the local view structure tool with the MCP server.
 * Follows the same pattern as other local tools for consistency.
 */
export function registerLocalViewStructureTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
    {
      description: LOCAL_VIEW_STRUCTURE_DESCRIPTION,
      inputSchema: BulkViewStructureSchema as unknown as AnySchema,
      outputSchema: LocalViewStructureOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'Local View Structure',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withBasicSecurityValidation(
      executeViewStructure,
      TOOL_NAMES.LOCAL_VIEW_STRUCTURE
    )
  );
}
