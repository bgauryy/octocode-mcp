import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
  invokeCallbackSafely,
} from './utils.js';
import { getDynamicHints, hasDynamicHints } from './hints/dynamic.js';

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

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          queries
        );

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

        // Note: Files are already filtered by shouldIgnoreFile in codeSearch.ts API layer
        const files = apiResult.data.items.map(item => {
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

        // Add pagination info if available
        const pagination = apiResult.data.pagination;
        if (pagination) {
          result.pagination = pagination;
        }

        const hasContent = files.length > 0;
        // Determine if specific owner/repo was requested (context for hints)
        const hasOwnerRepo = !!(query.owner && query.repo);

        // Generate pagination hints with full context for navigation
        const paginationHints: string[] = [];
        if (pagination) {
          const { currentPage, totalPages, totalMatches, perPage, hasMore } =
            pagination;
          const startItem = (currentPage - 1) * perPage + 1;
          const endItem = Math.min(currentPage * perPage, totalMatches);

          // Main pagination summary
          paginationHints.push(
            `Page ${currentPage}/${totalPages} (showing ${startItem}-${endItem} of ${totalMatches} matches)`
          );

          // Navigation hints
          if (hasMore) {
            paginationHints.push(`Next: page=${currentPage + 1}`);
          }
          if (currentPage > 1) {
            paginationHints.push(`Previous: page=${currentPage - 1}`);
          }
          if (!hasMore) {
            paginationHints.push('Final page');
          }

          // Quick navigation hint for multi-page results
          if (totalPages > 2) {
            paginationHints.push(
              `Jump to: page=1 (first) or page=${totalPages} (last)`
            );
          }
        }

        // Combine pagination hints with dynamic hints (static hints added by createSuccessResult)
        const dynamicHints = hasDynamicHints(TOOL_NAMES.GITHUB_SEARCH_CODE)
          ? getDynamicHints(
              TOOL_NAMES.GITHUB_SEARCH_CODE,
              hasContent ? 'hasResults' : 'empty',
              { hasOwnerRepo, match: query.match }
            )
          : [];
        const customHints = [...paginationHints, ...dynamicHints];

        return createSuccessResult(
          query,
          result as unknown as Record<string, unknown>,
          hasContent,
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          customHints
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: [
        'files',
        'pagination',
        'repositoryContext',
        'error',
      ] satisfies Array<keyof SearchResult>,
    }
  );
}
