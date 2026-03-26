import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toMCPSchema } from '../../types/toolTypes.js';
import { withSecurityValidation } from '../../utils/securityBridge.js';
import type { ToolInvocationCallback } from '../../types.js';
import type { GitHubCodeSearchQuery } from './types.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata/proxies.js';
import { GitHubCodeSearchBulkQuerySchema } from './scheme.js';
import { invokeCallbackSafely } from '../utils.js';
import { searchMultipleGitHubCode } from './execution.js';
import { GitHubSearchCodeOutputSchema } from '../../scheme/outputSchemas.js';

export function registerGitHubSearchCodeTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
      inputSchema: toMCPSchema(GitHubCodeSearchBulkQuerySchema),
      outputSchema: toMCPSchema(GitHubSearchCodeOutputSchema),
      annotations: {
        title: 'GitHub Code Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_SEARCH_CODE,
      async (
        args: {
          queries: GitHubCodeSearchQuery[];
          responseCharOffset?: number;
          responseCharLength?: number;
        },
        authInfo,
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          queries
        );

        return searchMultipleGitHubCode({
          queries,
          responseCharOffset: args.responseCharOffset,
          responseCharLength: args.responseCharLength,
          authInfo,
          sessionId,
        });
      }
    )
  );
}
