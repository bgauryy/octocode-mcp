import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';
import {
  BulkLSPCallHierarchySchema,
  LSP_CALL_HIERARCHY_DESCRIPTION,
} from './scheme.js';
import { executeCallHierarchy } from './execution.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { LspCallHierarchyOutputSchema } from '../../scheme/outputSchemas.js';

/**
 * Register the LSP call hierarchy tool with the MCP server.
 */
export function registerLSPCallHierarchyTool(server: McpServer) {
  return server.registerTool(
    STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
    {
      description: LSP_CALL_HIERARCHY_DESCRIPTION,
      inputSchema: BulkLSPCallHierarchySchema as unknown as AnySchema,
      outputSchema: LspCallHierarchyOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'Call Hierarchy',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withBasicSecurityValidation(
      executeCallHierarchy,
      STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY
    )
  );
}
