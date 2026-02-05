import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  GitHubReposSearchQuery,
  SimplifiedRepository,
  RepoSearchResult,
} from './types.js';
import {
  TOOL_NAMES,
  getDynamicHints as getMetadataDynamicHints,
} from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { handleCatchError, createSuccessResult } from '../utils.js';
import { getProvider } from '../../providers/factory.js';
import { getActiveProviderConfig } from '../../serverConfig.js';
import { isProviderSuccess } from '../../providers/types.js';

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
  const { queries, authInfo } = args;
  const { provider: providerType, baseUrl, token } = getActiveProviderConfig();
  const expandedQueries = expandQueriesWithBothSearchTypes(queries);

  return executeBulkOperation(
    expandedQueries,
    async (query: GitHubReposSearchQuery, _index: number) => {
      try {
        // Get provider instance
        const provider = getProvider(providerType, {
          type: providerType,
          baseUrl,
          token,
          authInfo,
        });

        // Parse stars filter if provided
        let minStars: number | undefined;
        if (query.stars) {
          const starsMatch = query.stars.match(/[<>=]*(\d+)/);
          if (starsMatch && starsMatch[1]) {
            minStars = parseInt(starsMatch[1], 10);
          }
        }

        // Convert query to provider format
        const providerQuery = {
          keywords: query.keywordsToSearch,
          topics: query.topicsToSearch,
          owner: query.owner,
          minStars,
          sort: query.sort as
            | 'stars'
            | 'forks'
            | 'updated'
            | 'created'
            | 'best-match'
            | undefined,
          limit: query.limit,
          page: query.page,
          mainResearchGoal: query.mainResearchGoal,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };

        const apiResult = await provider.searchRepos(providerQuery);

        if (!isProviderSuccess(apiResult)) {
          return handleCatchError(
            new Error(apiResult.error || 'Provider error'),
            query
          );
        }

        // Transform provider response to tool result format
        // Parse owner/repo from fullPath (e.g., "owner/repo")
        const repositories: SimplifiedRepository[] =
          apiResult.data.repositories.map(repo => {
            const [owner, repoName] = repo.fullPath.split('/');
            return {
              owner: owner || '',
              repo: repoName || repo.name,
              defaultBranch: repo.defaultBranch,
              stars: repo.stars,
              description: repo.description || '',
              url: repo.url,
              createdAt: repo.createdAt,
              updatedAt: repo.updatedAt,
              pushedAt: repo.lastActivityAt,
              visibility: repo.visibility,
              topics: repo.topics,
              forksCount: repo.forks,
              openIssuesCount: repo.openIssuesCount,
            };
          });

        const pagination = apiResult.data.pagination;

        const paginationHints: string[] = [];
        if (pagination) {
          const { currentPage, totalPages, totalEntries, hasMore } = pagination;
          const perPage = pagination.entriesPerPage || 10;
          const totalMatches = totalEntries || 0;
          const startItem = (currentPage - 1) * perPage + 1;
          const endItem = Math.min(currentPage * perPage, totalMatches);

          paginationHints.push(
            `Page ${currentPage}/${totalPages} (showing ${startItem}-${endItem} of ${totalMatches} repos)`
          );

          if (hasMore) {
            paginationHints.push(`Next: page=${currentPage + 1}`);
          }
          if (currentPage > 1) {
            paginationHints.push(`Previous: page=${currentPage - 1}`);
          }
          if (!hasMore) {
            paginationHints.push('Final page');
          }
          if (totalPages > 2) {
            paginationHints.push(
              `Jump to: page=1 (first) or page=${totalPages} (last)`
            );
          }
        }

        const searchHints = generateSearchSpecificHints(
          query,
          repositories.length > 0
        );

        // Transform pagination to expected format
        const resultPagination = pagination
          ? {
              currentPage: pagination.currentPage,
              totalPages: pagination.totalPages,
              perPage: pagination.entriesPerPage || 10,
              totalMatches: pagination.totalEntries || 0,
              hasMore: pagination.hasMore,
            }
          : undefined;

        return createSuccessResult(
          query,
          { repositories, pagination: resultPagination },
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
