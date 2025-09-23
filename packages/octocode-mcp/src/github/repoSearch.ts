import type {
  SearchReposParameters,
  RepoSearchResultItem,
  GitHubAPIResponse,
} from './github-openapi';
import {
  GitHubReposSearchQuery,
  SimplifiedRepository,
} from '../scheme/github_search_repos';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildRepoSearchQuery } from './queryBuilders';
import { generateCacheKey, withDataCache } from '../utils/cache';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { UserContext } from '../security/withSecurityValidation';

/**
 * Search GitHub repositories using Octokit API with proper TypeScript types and caching
 * Token management is handled internally by the GitHub client
 */
export async function searchGitHubReposAPI(
  params: GitHubReposSearchQuery,
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<
  GitHubAPIResponse<{
    total_count: number;
    repositories: SimplifiedRepository[];
  }>
> {
  // Generate cache key based on search parameters only (NO TOKEN DATA)
  const cacheKey = generateCacheKey(
    'gh-api-repos',
    params,
    userContext?.sessionId
  );

  const result = await withDataCache<
    GitHubAPIResponse<{
      total_count: number;
      repositories: SimplifiedRepository[];
    }>
  >(
    cacheKey,
    async () => {
      return await searchGitHubReposAPIInternal(params, authInfo);
    },
    {
      // Only cache successful responses
      shouldCache: value =>
        'data' in value && !(value as { error?: unknown }).error,
    }
  );

  return result;
}

/**
 * Internal implementation of searchGitHubReposAPI without caching
 */
async function searchGitHubReposAPIInternal(
  params: GitHubReposSearchQuery,
  authInfo?: AuthInfo
): Promise<
  GitHubAPIResponse<{
    total_count: number;
    repositories: SimplifiedRepository[];
  }>
> {
  try {
    const octokit = await getOctokit(authInfo);
    const query = buildRepoSearchQuery(params);

    if (!query.trim()) {
      return {
        error: 'Search query cannot be empty. Provide queryTerms or filters.',
        type: 'http',
        status: 400,
      };
    }

    // Use properly typed parameters
    const searchParams: SearchReposParameters = {
      q: query,
      per_page: Math.min(params.limit || 30, 100),
      page: 1,
    };

    // Add sort and order if specified
    if (params.sort && params.sort !== 'best-match') {
      searchParams.sort = params.sort as SearchReposParameters['sort'];
    }

    const result = await octokit.rest.search.repos(searchParams);

    // Transform repository results to match CLI format with proper typing
    const repositories = result.data.items.map(
      (repo: RepoSearchResultItem) => ({
        owner_repo: repo.full_name,
        stars: repo.stargazers_count || 0,
        description: repo.description
          ? repo.description.length > 150
            ? repo.description.substring(0, 150) + '...'
            : repo.description
          : 'No description',
        language: repo.language || 'Unknown',
        url: repo.html_url,
        forks: repo.forks || 0,
        updatedAt: new Date(repo.updated_at).toLocaleDateString('en-GB'),
      })
    );

    return {
      data: {
        total_count: result.data.total_count,
        repositories,
      },
      status: 200,
      headers: result.headers,
    };
  } catch (error: unknown) {
    return handleGitHubAPIError(error);
  }
}
