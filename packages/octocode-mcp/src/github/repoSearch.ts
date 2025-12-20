import type {
  SearchReposParameters,
  RepoSearchResultItem,
  GitHubAPIResponse,
} from './githubAPI';
import type { GitHubReposSearchQuery, SimplifiedRepository } from '../types';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildRepoSearchQuery } from './queryBuilders';
import { generateCacheKey, withDataCache } from '../utils/cache';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { SEARCH_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';
import { TOOL_NAMES } from '../tools/toolMetadata.js';

export async function searchGitHubReposAPI(
  params: GitHubReposSearchQuery,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<
  GitHubAPIResponse<{
    repositories: SimplifiedRepository[];
  }>
> {
  const cacheKey = generateCacheKey('gh-api-repos', params, sessionId);

  const result = await withDataCache<
    GitHubAPIResponse<{
      repositories: SimplifiedRepository[];
    }>
  >(
    cacheKey,
    async () => {
      return await searchGitHubReposAPIInternal(params, authInfo);
    },
    {
      shouldCache: value =>
        'data' in value && !(value as { error?: unknown }).error,
    }
  );

  return result;
}

async function searchGitHubReposAPIInternal(
  params: GitHubReposSearchQuery,
  authInfo?: AuthInfo
): Promise<
  GitHubAPIResponse<{
    repositories: SimplifiedRepository[];
  }>
> {
  try {
    const octokit = await getOctokit(authInfo);
    const query = buildRepoSearchQuery(params);

    if (!query.trim()) {
      await logSessionError(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        SEARCH_ERRORS.QUERY_EMPTY.code
      );
      return {
        error: SEARCH_ERRORS.QUERY_EMPTY.message,
        type: 'http',
        status: 400,
      };
    }

    const searchParams: SearchReposParameters = {
      q: query,
      per_page: Math.min(params.limit || 30, 100),
      page: 1,
    };

    if (params.sort && params.sort !== 'best-match') {
      searchParams.sort = params.sort as SearchReposParameters['sort'];
    }

    const result = await octokit.rest.search.repos(searchParams);

    const repositories = result.data.items
      .map((repo: RepoSearchResultItem) => {
        const fullName = repo.full_name;
        const parts = fullName.split('/');
        const owner = parts[0] || '';
        const repoName = parts[1] || '';

        return {
          owner,
          repo: repoName,
          stars: repo.stargazers_count || 0,
          description: repo.description
            ? repo.description.length > 150
              ? repo.description.substring(0, 150) + '...'
              : repo.description
            : 'No description',
          url: repo.html_url,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          pushedAt: repo.pushed_at,
        };
      })
      .sort((a: SimplifiedRepository, b: SimplifiedRepository) => {
        if (b.stars !== a.stars) {
          return b.stars - a.stars;
        }
        // ISO 8601 dates are lexicographically sortable
        return b.updatedAt.localeCompare(a.updatedAt);
      });

    return {
      data: {
        repositories,
      },
      status: 200,
      headers: result.headers,
    };
  } catch (error: unknown) {
    return handleGitHubAPIError(error);
  }
}
