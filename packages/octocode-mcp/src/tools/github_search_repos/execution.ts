import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { GitHubReposSearchQuery, SimplifiedRepository } from './types.js';
import {
  TOOL_NAMES,
  getDynamicHints as getMetadataDynamicHints,
} from '../toolMetadata/index.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import {
  handleCatchError,
  handleProviderError,
  createSuccessResult,
} from '../utils.js';
import { getProvider } from '../../providers/factory.js';
import { getActiveProviderConfig } from '../../serverConfig.js';
import type {
  ProviderResponse,
  RepoSearchResult as ProviderRepoSearchResult,
} from '../../providers/types.js';
import { isProviderSuccess } from '../../providers/types.js';

type RepoSearchVariantLabel = 'combined' | 'topics' | 'keywords';

interface RepoSearchVariant {
  label: RepoSearchVariantLabel;
  query: GitHubReposSearchQuery;
}

interface RepoSearchVariantExecution {
  label: RepoSearchVariantLabel;
  query: GitHubReposSearchQuery;
  apiResult: ProviderResponse<ProviderRepoSearchResult>;
}

type SuccessfulRepoSearchVariant = RepoSearchVariantExecution & {
  apiResult: ProviderResponse<ProviderRepoSearchResult> & {
    data: ProviderRepoSearchResult;
  };
};

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

function createSearchVariants(
  query: GitHubReposSearchQuery
): RepoSearchVariant[] {
  const hasTopics = hasValidTopics(query);
  const hasKeywords = hasValidKeywords(query);

  if (hasTopics && hasKeywords) {
    const { topicsToSearch, keywordsToSearch, ...baseQuery } = query;
    return [
      {
        label: 'topics',
        query: {
          ...baseQuery,
          reasoning: createSearchReasoning(query.reasoning, 'topics'),
          topicsToSearch,
        },
      },
      {
        label: 'keywords',
        query: {
          ...baseQuery,
          reasoning: createSearchReasoning(query.reasoning, 'keywords'),
          keywordsToSearch,
        },
      },
    ];
  }

  return [{ label: 'combined', query }];
}

function createProviderQuery(query: GitHubReposSearchQuery) {
  return {
    keywords: query.keywordsToSearch,
    topics: query.topicsToSearch,
    owner: query.owner,
    stars: query.stars,
    size: query.size,
    created: query.created,
    updated: query.updated,
    match: query.match,
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
}

function toSimplifiedRepositories(
  repositories: ProviderRepoSearchResult['repositories']
): SimplifiedRepository[] {
  return repositories.map(repo => {
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
}

function deduplicateRepositories(
  repositories: SimplifiedRepository[]
): SimplifiedRepository[] {
  const uniqueRepositories = new Map<string, SimplifiedRepository>();

  for (const repo of repositories) {
    const key = `${repo.owner}/${repo.repo}`;
    if (!uniqueRepositories.has(key)) {
      uniqueRepositories.set(key, repo);
    }
  }

  return [...uniqueRepositories.values()];
}

function isSuccessfulVariant(
  variant: RepoSearchVariantExecution
): variant is SuccessfulRepoSearchVariant {
  return isProviderSuccess(variant.apiResult);
}

function buildPaginationHints(pagination: {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  entriesPerPage?: number;
  totalMatches?: number;
}): string[] {
  const hints: string[] = [];
  const {
    currentPage,
    totalPages,
    totalMatches: totalMatchCount,
    hasMore,
  } = pagination;
  const perPage = pagination.entriesPerPage || 10;
  const totalMatches = totalMatchCount || 0;
  const startItem = (currentPage - 1) * perPage + 1;
  const endItem = Math.min(currentPage * perPage, totalMatches);

  hints.push(
    `Page ${currentPage}/${totalPages} (showing ${startItem}-${endItem} of ${totalMatches} repos)`
  );

  if (hasMore) {
    hints.push(`Next: page=${currentPage + 1}`);
  }
  if (currentPage > 1) {
    hints.push(`Previous: page=${currentPage - 1}`);
  }
  if (!hasMore) {
    hints.push('Final page');
  }
  if (totalPages > 2) {
    hints.push(`Jump to: page=1 (first) or page=${totalPages} (last)`);
  }

  return hints;
}

function buildResultPagination(pagination: {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  entriesPerPage?: number;
  totalMatches?: number;
}) {
  return {
    currentPage: pagination.currentPage,
    totalPages: pagination.totalPages,
    perPage: pagination.entriesPerPage || 10,
    totalMatches: pagination.totalMatches || 0,
    hasMore: pagination.hasMore,
  };
}

function createVariantFailureHints(
  failures: RepoSearchVariantExecution[]
): string[] {
  return failures.flatMap(failure => {
    const label =
      failure.label === 'topics'
        ? 'Topic search'
        : failure.label === 'keywords'
          ? 'Keyword search'
          : 'Search';
    const error = failure.apiResult.error || 'Provider error';
    return `${label} failed: ${error}`;
  });
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

  return executeBulkOperation(
    queries,
    async (query: GitHubReposSearchQuery, _index: number) => {
      try {
        const provider = getProvider(providerType, {
          type: providerType,
          baseUrl,
          token,
          authInfo,
        });
        const variants = createSearchVariants(query);
        const variantExecutions = await Promise.all(
          variants.map(async variant => ({
            label: variant.label,
            query: variant.query,
            apiResult: await provider.searchRepos(
              createProviderQuery(variant.query)
            ),
          }))
        );

        const successfulVariants =
          variantExecutions.filter(isSuccessfulVariant);
        const failedVariants = variantExecutions.filter(
          variant => !isSuccessfulVariant(variant)
        );

        if (successfulVariants.length === 0) {
          const firstFailedVariant = failedVariants[0];
          if (!firstFailedVariant) {
            return handleCatchError(
              new Error('Repository search produced no provider results'),
              query
            );
          }
          return handleProviderError(firstFailedVariant.apiResult, query);
        }

        const repositories = deduplicateRepositories(
          successfulVariants.flatMap(variant =>
            toSimplifiedRepositories(variant.apiResult.data.repositories)
          )
        );

        const searchHints = generateSearchSpecificHints(
          query,
          repositories.length > 0
        );
        const onlySuccessfulVariant =
          successfulVariants.length === 1 ? successfulVariants[0] : undefined;
        const successfulPagination =
          onlySuccessfulVariant?.apiResult.data.pagination;
        const paginationHints = successfulPagination
          ? buildPaginationHints(successfulPagination)
          : [];
        const resultPagination = successfulPagination
          ? buildResultPagination(successfulPagination)
          : undefined;
        const mergeHints =
          successfulVariants.length > 1
            ? [
                'Combined topic and keyword searches into one result; pagination is omitted because multiple result sets were merged.',
              ]
            : [];
        const partialFailureHints =
          variants.length > 1 && successfulVariants.length === 1
            ? [
                `Only ${onlySuccessfulVariant?.label ?? 'one'} search succeeded; pagination reflects that subset.`,
                ...createVariantFailureHints(failedVariants),
              ]
            : createVariantFailureHints(failedVariants);

        return createSuccessResult(
          query,
          { repositories, pagination: resultPagination },
          repositories.length > 0,
          TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
          {
            extraHints: [
              ...mergeHints,
              ...partialFailureHints,
              ...paginationHints,
              ...(searchHints || []),
            ],
          }
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      keysPriority: ['repositories', 'pagination', 'error'] satisfies string[],
    }
  );
}
