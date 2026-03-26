import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toMCPSchema } from '../../types/toolTypes.js';
import { withSecurityValidation } from '../../utils/securityBridge.js';
import type { ToolInvocationCallback } from '../../types.js';
import type { GitHubPullRequestSearchQuery } from './types.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata/proxies.js';
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
      inputSchema: toMCPSchema(GitHubPullRequestSearchBulkQuerySchema),
      outputSchema: toMCPSchema(GitHubSearchPullRequestsOutputSchema),
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
          responseCharOffset?: number;
          responseCharLength?: number;
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
          responseCharOffset: args.responseCharOffset,
          responseCharLength: args.responseCharLength,
          authInfo,
          sessionId,
        });
      }
    )
  );
}
