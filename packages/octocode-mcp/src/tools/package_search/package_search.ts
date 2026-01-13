import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import type { ToolInvocationCallback } from '../../types.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata.js';
import { PackageSearchBulkQuerySchema } from './scheme.js';
import type { PackageSearchQuery } from './scheme.js';
import { invokeCallbackSafely } from '../utils.js';
import { checkNpmAvailability } from '../../utils/exec/index.js';
import { searchPackages } from './execution.js';

export async function registerPackageSearchTool(
  server: McpServer,
  callback?: ToolInvocationCallback
): Promise<RegisteredTool | null> {
  const npmAvailable = await checkNpmAvailability(10000);
  if (!npmAvailable) {
    return null;
  }

  return server.registerTool(
    TOOL_NAMES.PACKAGE_SEARCH,
    {
      description: DESCRIPTIONS[TOOL_NAMES.PACKAGE_SEARCH],
      inputSchema: PackageSearchBulkQuerySchema as unknown as AnySchema,
      annotations: {
        title: 'Package Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.PACKAGE_SEARCH,
      async (
        args: {
          queries: PackageSearchQuery[];
        },
        _authInfo,
        _sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.PACKAGE_SEARCH,
          queries
        );

        return searchPackages({ queries });
      }
    )
  );
}
