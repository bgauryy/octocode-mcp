/**
 * LSP Go To Definition tool
 * Navigates to the definition of a symbol using Language Server Protocol
 * @module tools/lsp_goto_definition
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';

import {
  BulkLSPGotoDefinitionSchema,
  LSP_GOTO_DEFINITION_DESCRIPTION,
} from './scheme.js';
import { executeGotoDefinition } from './execution.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';

/**
 * Register the LSP Go To Definition tool with the MCP server.
 */
export function registerLSPGotoDefinitionTool(server: McpServer) {
  return server.registerTool(
    STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
    {
      description: LSP_GOTO_DEFINITION_DESCRIPTION,
      inputSchema: BulkLSPGotoDefinitionSchema as unknown as AnySchema,
      annotations: {
        title: 'Go To Definition',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withBasicSecurityValidation(executeGotoDefinition, STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION)
  );
}

// Re-export for testing
export { addLineNumbers, isImportOrReExport } from './execution.js';
