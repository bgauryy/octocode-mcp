import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { BulkFindFilesSchema, LOCAL_FIND_FILES_DESCRIPTION } from './scheme.js';
import { executeFindFiles } from './execution.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';
import { LocalFindFilesOutputSchema } from '../../scheme/outputSchemas.js';

/**
 * Register the local find files tool with the MCP server.
 * Follows the same pattern as GitHub tools for consistency.
 */
export function registerLocalFindFilesTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.LOCAL_FIND_FILES,
    {
      description: LOCAL_FIND_FILES_DESCRIPTION,
      inputSchema: BulkFindFilesSchema as unknown as AnySchema,
      outputSchema: LocalFindFilesOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'Local Find Files',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withBasicSecurityValidation(executeFindFiles, TOOL_NAMES.LOCAL_FIND_FILES)
  );
}
