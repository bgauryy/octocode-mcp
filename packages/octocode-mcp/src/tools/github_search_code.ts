import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  UserContext,
  ToolInvocationCallback,
  GitHubCodeSearchQuery,
  SearchResult,
} from '../types.js';
import { TOOL_NAMES } from '../constants.js';
import { GitHubCodeSearchBulkQuerySchema } from '../scheme/github_search_code.js';
import { searchGitHubCodeAPI } from '../github/codeSearch.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions.js';
import { shouldIgnoreFile } from '../utils/fileFilters.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
} from './utils.js';

export function registerGitHubSearchCodeTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
      inputSchema: GitHubCodeSearchBulkQuerySchema.shape,
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
        },
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        // Invoke callback if provided
        if (callback) {
          try {
            await callback(TOOL_NAMES.GITHUB_SEARCH_CODE, queries);
          } catch {
            // Silently ignore callback errors
          }
        }

        return searchMultipleGitHubCode(queries, authInfo, userContext);
      }
    )
  );
}

/**
 * Extract owner and repo from nameWithOwner format (owner/repo)
 */
function extractOwnerAndRepo(nameWithOwner: string | undefined): {
  owner?: string;
  repo?: string;
} {
  if (!nameWithOwner) return {};

  const parts = nameWithOwner.split('/');
  return parts.length === 2 ? { owner: parts[0], repo: parts[1] } : {};
}

/**
 * Get nameWithOwner from API result
 */
function getNameWithOwner(apiResult: {
  data: {
    repository?: { name?: string };
    items: Array<{ repository?: { nameWithOwner?: string } }>;
  };
}): string | undefined {
  return (
    apiResult.data.repository?.name ||
    apiResult.data.items[0]?.repository?.nameWithOwner
  );
}

async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: GitHubCodeSearchQuery, _index: number) => {
      try {
        const apiResult = await searchGitHubCodeAPI(
          query,
          authInfo,
          userContext
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        if (!('data' in apiResult)) {
          return handleCatchError(
            new Error('Invalid API response structure'),
            query
          );
        }

        const { owner, repo } = extractOwnerAndRepo(
          getNameWithOwner(apiResult)
        );

        // For path search, only return paths (text_matches would be confusing)
        // For file/content search, include text_matches with code snippets
        const files = apiResult.data.items
          .filter(item => !shouldIgnoreFile(item.path))
          .map(item => {
            if (query.match === 'path') {
              // Path search: only return the matched paths
              return { path: item.path };
            }
            // Content search: include text_matches showing where keyword appears
            return {
              path: item.path,
              text_matches: item.matches.map(match => match.context),
            };
          });

        return createSuccessResult(
          query,
          { owner, repo, files },
          files.length > 0,
          'GITHUB_SEARCH_CODE'
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: ['files', 'error'] satisfies Array<keyof SearchResult>,
    }
  );
}
