import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import type {
  ToolInvocationCallback,
  GitHubPullRequestSearchQuery,
} from '../../types.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata.js';
import { GitHubPullRequestSearchBulkQuerySchema } from './scheme.js';
import { invokeCallbackSafely } from '../utils.js';
import { searchMultipleGitHubPullRequests } from './execution.js';

const VALIDATION_MESSAGES = {
  QUERY_TOO_LONG: 'Query too long. Maximum 256 characters allowed.',
  MISSING_PARAMS:
    'At least one valid search parameter, filter, or PR number is required.',
} as const;

function hasQueryLengthError(query: GitHubPullRequestSearchQuery): boolean {
  return Boolean(query?.query && String(query.query).length > 256);
}

function hasValidSearchParams(query: GitHubPullRequestSearchQuery): boolean {
  return Boolean(
    query?.query?.trim() ||
    query?.owner ||
    query?.repo ||
    query?.author ||
    query?.assignee ||
    (query?.prNumber && query?.owner && query?.repo)
  );
}

function addValidationError(
  query: GitHubPullRequestSearchQuery,
  error: string
): GitHubPullRequestSearchQuery {
  return {
    ...query,
    _validationError: error,
  } as GitHubPullRequestSearchQuery;
}

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
        let queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          queries
        );

        const longQueryIndex = queries.findIndex(hasQueryLengthError);
        if (longQueryIndex !== -1) {
          queries = queries.map((q, i) =>
            i === longQueryIndex
              ? addValidationError(q, VALIDATION_MESSAGES.QUERY_TOO_LONG)
              : q
          );
        }

        if (queries.length > 0 && !queries.some(hasValidSearchParams)) {
          queries = queries.map((q, i) =>
            i === 0
              ? addValidationError(q, VALIDATION_MESSAGES.MISSING_PARAMS)
              : q
          );
        }

        return searchMultipleGitHubPullRequests({
          queries,
          authInfo,
          sessionId,
        });
      }
    )
  );
}
