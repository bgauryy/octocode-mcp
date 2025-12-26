import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  ToolInvocationCallback,
  GitHubCodeSearchQuery,
  SearchResult,
} from '../types.js';
import { TOOL_NAMES, DESCRIPTIONS, getDynamicHints } from './toolMetadata.js';
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
) {
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

        if (!('data' in apiResult)) {
          return handleCatchError(
            new Error('Invalid API response structure'),
            query
          );
        }

        const files = apiResult.data.items
          .filter(item => !shouldIgnoreFile(item.path))
          .map(item => {
            const repoName = item.repository?.nameWithOwner;
            const baseFile = {
              path: item.path,
              ...(repoName && { repo: repoName }),
              ...(item.lastModifiedAt && {
                lastModifiedAt: item.lastModifiedAt,
              }),
            };

            if (query.match === 'path') {
              return baseFile;
            }
            return {
              ...baseFile,
              text_matches: item.matches.map(match => match.context),
            };
          });

        const result: SearchResult = { files };
        const repoContext = apiResult.data._researchContext?.repositoryContext;
        if (repoContext) {
          result.repositoryContext = repoContext;
        }

        const customHints = generateCodeSearchHints(files, repoContext);

        return createSuccessResult(
          query,
          result as unknown as Record<string, unknown>,
          files.length > 0,
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          customHints
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: ['files', 'repositoryContext', 'error'] satisfies Array<
        keyof SearchResult
      >,
    }
  );
}

/**
 * Generate custom hints for code search results to help agents use the data
 */
function generateCodeSearchHints(
  files: Array<{ path: string; repo?: string; text_matches?: string[] }>,
  repoContext?: { owner: string; repo: string }
): string[] {
  const hints: string[] = [];

  if (files.length > 0) {
    if (repoContext) {
      hints.push(
        ...getDynamicHints(TOOL_NAMES.GITHUB_SEARCH_CODE, 'singleRepo')
      );
    } else if (files.some(f => f.repo)) {
      hints.push(
        ...getDynamicHints(TOOL_NAMES.GITHUB_SEARCH_CODE, 'multiRepo')
      );
    }
  }

  return hints;
}
