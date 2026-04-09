import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toMCPSchema } from '../../types/toolTypes.js';
import {
  BulkLSPCallHierarchySchema,
  LSP_CALL_HIERARCHY_DESCRIPTION,
} from '@octocodeai/octocode-core';
import { executeCallHierarchy } from './execution.js';
import { withBasicSecurityValidation } from '../../utils/securityBridge.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { LspCallHierarchyOutputSchema } from '@octocodeai/octocode-core';

/**
 * Register the LSP call hierarchy tool with the MCP server.
 */
export function registerLSPCallHierarchyTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.LSP_CALL_HIERARCHY,
    {
      description: LSP_CALL_HIERARCHY_DESCRIPTION,
      inputSchema: toMCPSchema(BulkLSPCallHierarchySchema),
      outputSchema: toMCPSchema(LspCallHierarchyOutputSchema),
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
      TOOL_NAMES.LSP_CALL_HIERARCHY
    )
  );
}
