import type { SearchReposParameters, RepoSearchResultItem } from './types';
import { GitHubReposSearchQuery } from '../mcp/scheme/github_search_repos';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildRepoSearchQuery } from './queryBuilders';
import { generateCacheKey, withCache } from '../mcp/utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../mcp/responses';

/**
 * Search GitHub repositories using Octokit API with proper TypeScript types and caching
 * Token management is handled internally by the GitHub client
 */
export async function searchGitHubReposAPI(
  params: GitHubReposSearchQuery
): Promise<CallToolResult> {
  // Generate cache key based on search parameters only (NO TOKEN DATA)
  const cacheKey = generateCacheKey('gh-api-repos', params);

  // Use cache with 2-hour TTL (configured in cache.ts)
  return await withCache(cacheKey, () => searchGitHubReposAPIInternal(params));
}

/**
 * Internal implementation of searchGitHubReposAPI without caching
 */
async function searchGitHubReposAPIInternal(
  params: GitHubReposSearchQuery
): Promise<CallToolResult> {
  try {
    const octokit = await getOctokit();
    const query = buildRepoSearchQuery(params);

    if (!query.trim()) {
      return createResult({
        error: 'Search query cannot be empty. Provide queryTerms or filters.',
        isError: true,
        meta: { status: 400, type: 'http' },
      });
    }

    // Use properly typed parameters
    const limit = typeof params.limit === 'number' ? params.limit : 30;
    const searchParams: SearchReposParameters = {
      q: query,
      per_page: Math.min(limit, 100),
      page: 1,
    };

    // Add sort and order if specified
    if (params.sort && params.sort !== 'best-match') {
      searchParams.sort = params.sort as SearchReposParameters['sort'];
    }
    if (params.order) {
      searchParams.order = params.order as SearchReposParameters['order'];
    }

    const result = await octokit.rest.search.repos(searchParams);

    // Transform repository results to match CLI format with proper typing
    const repositories = result.data.items.map(
      (repo: RepoSearchResultItem) => ({
        name: repo.full_name,
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
        owner: repo.owner?.login || 'Unknown',
      })
    );

    return createResult({
      data: {
        total_count: result.data.total_count,
        repositories,
      },
      meta: {
        status: 200,
        headers: result.headers,
      },
    });
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return createResult({
      error: `Repository search failed: ${apiError.error}`,
      isError: true,
      meta: {
        status: apiError.status,
        type: apiError.type,
        rateLimitRemaining: apiError.rateLimitRemaining,
        rateLimitReset: apiError.rateLimitReset,
      },
    });
  }
}
