import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import {
  BulkFetchContentSchema,
  LOCAL_FETCH_CONTENT_DESCRIPTION,
} from './scheme.js';
import { executeFetchContent } from './execution.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';
import { LocalGetFileContentOutputSchema } from '../../scheme/outputSchemas.js';

/**
 * Register the local fetch content tool with the MCP server.
 * Follows the same pattern as GitHub tools for consistency.
 */
export function registerLocalFetchContentTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.LOCAL_FETCH_CONTENT,
    {
      description: LOCAL_FETCH_CONTENT_DESCRIPTION,
      inputSchema: BulkFetchContentSchema as unknown as AnySchema,
      outputSchema: LocalGetFileContentOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'Local Fetch Content',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withBasicSecurityValidation(
      executeFetchContent,
      TOOL_NAMES.LOCAL_FETCH_CONTENT
    )
  );
}
