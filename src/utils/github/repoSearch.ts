import type {
  SearchReposParameters,
  RepoSearchResultItem,
  GitHubAPIResponse,
  Repository,
} from '../../types/github-openapi';
import { GitHubReposSearchQuery } from '../../mcp/tools/scheme/github_search_repos';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildRepoSearchQuery } from './queryBuilders';

/**
 * Search GitHub repositories using Octokit API with proper TypeScript types
 */
export async function searchGitHubReposAPI(
  params: GitHubReposSearchQuery,
  token?: string
): Promise<
  GitHubAPIResponse<{ total_count: number; repositories: Repository[] }>
> {
  try {
    const octokit = getOctokit(token);
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
