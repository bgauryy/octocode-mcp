import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  GitHubReposSearchQuery,
  SimplifiedRepository,
  RepoSearchResult,
} from '../../types.js';
import { searchGitHubReposAPI } from '../../github/repoSearch.js';
import {
  TOOL_NAMES,
  getDynamicHints as getMetadataDynamicHints,
} from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
} from '../utils.js';

function hasValidTopics(query: GitHubReposSearchQuery): boolean {
  return Boolean(
    query.topicsToSearch &&
    (Array.isArray(query.topicsToSearch)
      ? query.topicsToSearch.length > 0
      : query.topicsToSearch)
  );
}

function hasValidKeywords(query: GitHubReposSearchQuery): boolean {
  return Boolean(query.keywordsToSearch && query.keywordsToSearch.length > 0);
}

function createSearchReasoning(
  originalReasoning: string | undefined,
  searchType: 'topics' | 'keywords'
): string {
  const suffix =
    searchType === 'topics' ? 'topics-based search' : 'keywords-based search';
  return originalReasoning
    ? `${originalReasoning} (${suffix})`
    : `${searchType.charAt(0).toUpperCase() + searchType.slice(1)}-based repository search`;
}

function expandQueriesWithBothSearchTypes(
  queries: GitHubReposSearchQuery[]
): GitHubReposSearchQuery[] {
  const expandedQueries: GitHubReposSearchQuery[] = [];

  for (const query of queries) {
    const hasTopics = hasValidTopics(query);
    const hasKeywords = hasValidKeywords(query);

    if (hasTopics && hasKeywords) {
      const { topicsToSearch, keywordsToSearch, ...baseQuery } = query;

      expandedQueries.push(
        {
          ...baseQuery,
          reasoning: createSearchReasoning(query.reasoning, 'topics'),
          topicsToSearch,
        },
        {
          ...baseQuery,
          reasoning: createSearchReasoning(query.reasoning, 'keywords'),
          keywordsToSearch,
        }
      );
    } else {
      expandedQueries.push(query);
    }
  }

  return expandedQueries;
}

/**
 * Generate search-type specific hints from metadata dynamic hints
 */
function generateSearchSpecificHints(
  query: GitHubReposSearchQuery,
  hasResults: boolean
): string[] | undefined {
  const hints: string[] = [];
  const hasTopics = hasValidTopics(query);
  const hasKeywords = hasValidKeywords(query);

  if (hasTopics && hasResults) {
    hints.push(
      ...getMetadataDynamicHints(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        'topicsHasResults'
      )
    );
  } else if (hasTopics && !hasResults) {
    hints.push(
      ...getMetadataDynamicHints(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        'topicsEmpty'
      )
    );
  } else if (hasKeywords && !hasResults && !hasTopics) {
    hints.push(
      ...getMetadataDynamicHints(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        'keywordsEmpty'
      )
    );
  }

  return hints.length > 0 ? hints : undefined;
}

export async function searchMultipleGitHubRepos(
  args: ToolExecutionArgs<GitHubReposSearchQuery>
): Promise<CallToolResult> {
  const { queries, authInfo, sessionId } = args;
  const expandedQueries = expandQueriesWithBothSearchTypes(queries);

  return executeBulkOperation(
    expandedQueries,
    async (query: GitHubReposSearchQuery, _index: number) => {
      try {
        const apiResult = await searchGitHubReposAPI(
          query,
          authInfo,
          sessionId
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        const repositories =
          'data' in apiResult
            ? apiResult.data.repositories || []
            : ([] satisfies SimplifiedRepository[]);

        const pagination =
          'data' in apiResult ? apiResult.data.pagination : undefined;

        // Generate pagination hints with full context for navigation
        const paginationHints: string[] = [];
        if (pagination) {
          const { currentPage, totalPages, totalMatches, perPage, hasMore } =
            pagination;
          const startItem = (currentPage - 1) * perPage + 1;
          const endItem = Math.min(currentPage * perPage, totalMatches);

          // Main pagination summary
          paginationHints.push(
            `Page ${currentPage}/${totalPages} (showing ${startItem}-${endItem} of ${totalMatches} repos)`
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

        // Generate search-type specific hints from metadata
        const searchHints = generateSearchSpecificHints(
          query,
          repositories.length > 0
        );

        // Use unified pattern: extraHints for pagination and search-specific hints
        return createSuccessResult(
          query,
          { repositories, pagination },
          repositories.length > 0,
          TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
          {
            extraHints: [...paginationHints, ...(searchHints || [])],
          }
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      keysPriority: ['repositories', 'pagination', 'error'] satisfies Array<
        keyof RepoSearchResult
      >,
    }
  );
}
