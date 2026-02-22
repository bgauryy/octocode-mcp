import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import type { ToolInvocationCallback } from '../../types.js';
import type { FileContentQuery } from './types.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata.js';
import { FileContentBulkQuerySchema } from './scheme.js';
import { invokeCallbackSafely } from '../utils.js';
import { fetchMultipleGitHubFileContents } from './execution.js';
import { GitHubFetchContentOutputSchema } from '../../scheme/outputSchemas.js';

export function registerFetchGitHubFileContentTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_FETCH_CONTENT,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_FETCH_CONTENT],
      inputSchema: FileContentBulkQuerySchema as unknown as AnySchema,
      outputSchema: GitHubFetchContentOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'GitHub File Content Fetch',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_FETCH_CONTENT,
      async (
        args: {
          queries: FileContentQuery[];
        },
        authInfo,
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_FETCH_CONTENT,
          queries
        );

        return fetchMultipleGitHubFileContents({
          queries,
          authInfo,
          sessionId,
        });
      }
    )
  );
}
