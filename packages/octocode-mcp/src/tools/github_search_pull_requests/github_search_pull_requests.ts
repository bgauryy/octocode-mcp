import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import type { ToolInvocationCallback } from '../../types.js';
import type { GitHubPullRequestSearchQuery } from './types.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata/index.js';
import { GitHubPullRequestSearchBulkQuerySchema } from './scheme.js';
import { invokeCallbackSafely } from '../utils.js';
import { searchMultipleGitHubPullRequests } from './execution.js';
import { GitHubSearchPullRequestsOutputSchema } from '../../scheme/outputSchemas.js';

export function registerSearchGitHubPullRequestsTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
      inputSchema:
        GitHubPullRequestSearchBulkQuerySchema as unknown as AnySchema,
      outputSchema:
        GitHubSearchPullRequestsOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'GitHub Pull Request Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      async (
        args: {
          queries: GitHubPullRequestSearchQuery[];
        },
        authInfo,
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          queries
        );

        return searchMultipleGitHubPullRequests({
          queries,
          authInfo,
          sessionId,
        });
      }
    )
  );
}
