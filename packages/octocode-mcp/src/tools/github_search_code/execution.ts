import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { GitHubCodeSearchQuery, SearchResult } from './types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { handleCatchError, createSuccessResult } from '../utils.js';
import { getProvider } from '../../providers/factory.js';
import { getActiveProviderConfig } from '../../serverConfig.js';
import { isProviderSuccess } from '../../providers/types.js';

export async function searchMultipleGitHubCode(
  args: ToolExecutionArgs<GitHubCodeSearchQuery>
): Promise<CallToolResult> {
  const { queries, authInfo } = args;
  const { provider: providerType, baseUrl, token } = getActiveProviderConfig();

  return executeBulkOperation(
    queries,
    async (query: GitHubCodeSearchQuery, _index: number) => {
      try {
        // Get provider instance
        const provider = getProvider(providerType, {
          type: providerType,
          baseUrl,
          token,
          authInfo,
        });

        // Convert query to provider format
        const providerQuery = {
          keywords: query.keywordsToSearch,
          projectId:
            query.owner && query.repo
              ? `${query.owner}/${query.repo}`
              : undefined,
          path: query.path,
          filename: query.filename,
          extension: query.extension,
          match: query.match,
          limit: query.limit,
          page: query.page,
          mainResearchGoal: query.mainResearchGoal,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };

        const apiResult = await provider.searchCode(providerQuery);

        if (!isProviderSuccess(apiResult)) {
          return handleCatchError(
            new Error(apiResult.error || 'Provider error'),
            query
          );
        }

        // Transform provider response to tool result format
        const files = apiResult.data.items.map(item => {
          const baseFile = {
            path: item.path,
            repo: item.repository.name,
            ...(item.lastModifiedAt && { lastModifiedAt: item.lastModifiedAt }),
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

        if (apiResult.data.repositoryContext) {
          result.repositoryContext = apiResult.data.repositoryContext;
        }

        if (apiResult.data.pagination) {
          result.pagination = {
            currentPage: apiResult.data.pagination.currentPage,
            totalPages: apiResult.data.pagination.totalPages,
            perPage: apiResult.data.pagination.entriesPerPage || 10,
            totalMatches: apiResult.data.pagination.totalMatches || 0,
            hasMore: apiResult.data.pagination.hasMore,
          };
        }

        const hasContent = files.length > 0;
        const hasOwnerRepo = !!(query.owner && query.repo);

        // Generate pagination hints
        const paginationHints: string[] = [];
        if (result.pagination) {
          const { currentPage, totalPages, totalMatches, perPage, hasMore } =
            result.pagination;
          const startItem = (currentPage - 1) * perPage + 1;
          const endItem = Math.min(currentPage * perPage, totalMatches);

          paginationHints.push(
            `Page ${currentPage}/${totalPages} (showing ${startItem}-${endItem} of ${totalMatches} matches)`
          );

          if (hasMore) paginationHints.push(`Next: page=${currentPage + 1}`);
          if (currentPage > 1)
            paginationHints.push(`Previous: page=${currentPage - 1}`);
          if (!hasMore) paginationHints.push('Final page');
          if (totalPages > 2) {
            paginationHints.push(
              `Jump to: page=1 (first) or page=${totalPages} (last)`
            );
          }
        }

        return createSuccessResult(
          query,
          result as unknown as Record<string, unknown>,
          hasContent,
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          {
            hintContext: { hasOwnerRepo, match: query.match },
            extraHints: paginationHints,
          }
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: ['files', 'pagination', 'repositoryContext', 'error'],
    }
  );
}
