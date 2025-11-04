import type {
  SearchReposParameters,
  RepoSearchResultItem,
  GitHubAPIResponse,
} from './githubAPI';
import type {
  GitHubReposSearchQuery,
  SimplifiedRepository,
  UserContext,
} from '../types';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildRepoSearchQuery } from './queryBuilders';
import { generateCacheKey, withDataCache } from '../utils/cache';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

export async function searchGitHubReposAPI(
  params: GitHubReposSearchQuery,
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<
  GitHubAPIResponse<{
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
      return {
        error:
          'Search query cannot be empty. Provide keywordsToSearch or filters.',
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
          updatedAt: new Date(repo.updated_at).toLocaleDateString('en-GB'),
        };
      })
      .sort((a: SimplifiedRepository, b: SimplifiedRepository) => {
        if (b.stars !== a.stars) {
          return b.stars - a.stars;
        }
        const dateA = new Date(a.updatedAt.split('/').reverse().join('-'));
        const dateB = new Date(b.updatedAt.split('/').reverse().join('-'));
        return dateB.getTime() - dateA.getTime();
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
