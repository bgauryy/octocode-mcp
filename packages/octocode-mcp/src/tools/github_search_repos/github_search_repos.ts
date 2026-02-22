import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import type { ToolInvocationCallback } from '../../types.js';
import type { GitHubReposSearchQuery } from './types.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata.js';
import { GitHubReposSearchQuerySchema } from './scheme.js';
import { invokeCallbackSafely } from '../utils.js';
import { searchMultipleGitHubRepos } from './execution.js';
import { GitHubSearchRepositoriesOutputSchema } from '../../scheme/outputSchemas.js';

export function registerSearchGitHubReposTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES],
      inputSchema: GitHubReposSearchQuerySchema as unknown as AnySchema,
      outputSchema:
        GitHubSearchRepositoriesOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'GitHub Repository Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      async (
        args: {
          queries: GitHubReposSearchQuery[];
        },
        authInfo,
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
          queries
        );

        return searchMultipleGitHubRepos({ queries, authInfo, sessionId });
      }
    )
  );
}
