import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  ToolInvocationCallback,
  GitHubCodeSearchQuery,
  SearchResult,
} from '../types.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';
import { GitHubCodeSearchBulkQuerySchema } from '../scheme/github_search_code.js';
import { searchGitHubCodeAPI } from '../github/codeSearch.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { shouldIgnoreFile } from '../utils/fileFilters.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
} from './utils.js';

export function registerGitHubSearchCodeTool(
  server: McpServer,
  callback?: ToolInvocationCallback
): RegisteredTool {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
      inputSchema: GitHubCodeSearchBulkQuerySchema,
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
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        if (callback) {
          try {
            await callback(TOOL_NAMES.GITHUB_SEARCH_CODE, queries);
            // eslint-disable-next-line no-empty
          } catch {}
        }

        return searchMultipleGitHubCode(queries, authInfo, sessionId);
      }
    )
  );
}

async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: GitHubCodeSearchQuery, _index: number) => {
      try {
        const apiResult = await searchGitHubCodeAPI(query, authInfo, sessionId);

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        if (!('data' in apiResult) || !apiResult.data) {
          return handleCatchError(
            new Error('Invalid API response structure'),
            query
          );
        }

        const filteredItems = apiResult.data.items.filter(
          item => !shouldIgnoreFile(item.path)
        );

        const isPathOnlyMatch = query.match === 'path';

        const repoMetadata: Record<string, { pushedAt: string }> = {};
        const repoResults: Record<string, Record<string, string[]>> = {};

        for (const item of filteredItems) {
          const nameWithOwner = item.repository?.nameWithOwner || 'unknown';
          const pushedAt = item.repository?.pushedAt || '';

          if (!repoResults[nameWithOwner]) {
            repoResults[nameWithOwner] = {};
            repoMetadata[nameWithOwner] = { pushedAt };
          }

          if (isPathOnlyMatch) {
            repoResults[nameWithOwner][item.path] = ['(match="path")'];
          } else {
            const textMatches = item.matches.map(match => match.context);
            repoResults[nameWithOwner][item.path] = textMatches;
          }
        }

        const sortedRepos = Object.keys(repoResults).sort((a, b) => {
          const aPushed = repoMetadata[a]?.pushedAt || '';
          const bPushed = repoMetadata[b]?.pushedAt || '';
          if (aPushed !== bPushed) {
            return bPushed.localeCompare(aPushed); // Descending (newest first)
          }
          return a.localeCompare(b); // Alphabetically as tiebreaker
        });

        const sortedResults: Record<string, Record<string, string[]>> = {};
        for (const repo of sortedRepos) {
          const repoData = repoResults[repo];
          if (!repoData) continue;

          const paths = Object.keys(repoData);
          const sortedPaths = paths.sort((a, b) => {
            const aDepth = a.split('/').length;
            const bDepth = b.split('/').length;
            if (aDepth !== bDepth) {
              return aDepth - bDepth;
            }
            return a.localeCompare(b);
          });

          sortedResults[repo] = {};
          for (const path of sortedPaths) {
            sortedResults[repo][path] = repoData[path]!;
          }
        }

        return createSuccessResult(
          query,
          { repositories: sortedResults } satisfies SearchResult,
          Object.keys(sortedResults).length > 0,
          'GITHUB_SEARCH_CODE'
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: ['error'] satisfies Array<keyof SearchResult>,
    }
  );
}
