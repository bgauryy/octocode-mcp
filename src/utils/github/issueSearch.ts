import { GitHubIssuesSearchParams } from '../../types/github-openapi';
import {
  GitHubIssueSearchResult,
  GitHubIssueSearchError,
} from '../../mcp/tools/scheme/github_search_issues';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildIssueSearchQuery } from './queryBuilders';

/**
 * Search GitHub issues using Octokit API
 */
export async function searchGitHubIssuesAPI(
  params: GitHubIssuesSearchParams,
  token?: string
): Promise<GitHubIssueSearchResult | GitHubIssueSearchError> {
  try {
    const octokit = getOctokit(token);

    // Build search query
    const searchQuery = buildIssueSearchQuery(params);

    if (!searchQuery) {
      return {
        error: 'No valid search parameters provided',
        hints: [
          'Add search query OR filters',
          'Try specific repo: --owner owner --repo repo',
        ],
      };
    }

    // Execute search using GitHub Search API
    const searchResult = await octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      sort:
        params.sort && params.sort !== 'best-match' ? params.sort : undefined,
      order: params.order || 'desc',
      per_page: Math.min(params.limit || 25, 100),
    });

    // Filter out pull requests unless explicitly requested
    const issues =
      searchResult.data.items?.filter((item: any) =>
        params['include-prs'] ? true : !item.pull_request
      ) || [];

    // Transform issues to match our schema format
    const transformedIssues = issues.map((item: any) => {
      return {
        id: item.id,
        number: item.number,
        title: item.title || '',
        url: item.url,
        html_url: item.html_url,
        repository_url: item.repository_url,
        labels_url: item.labels_url,
        comments_url: item.comments_url,
        events_url: item.events_url,
        state: item.state,
        state_reason: item.state_reason,
        created_at: item.created_at,
        updated_at: item.updated_at,
        closed_at: item.closed_at,
        body: item.body,
        user: {
          login: item.user?.login || '',
          id: item.user?.id || 0,
          avatar_url: item.user?.avatar_url || '',
          html_url: item.user?.html_url || '',
          type: item.user?.type || '',
        },
        assignee: item.assignee
          ? {
              login: item.assignee.login,
              id: item.assignee.id,
              avatar_url: item.assignee.avatar_url,
              html_url: item.assignee.html_url,
              type: item.assignee.type,
            }
          : null,
        assignees:
          item.assignees?.map((a: any) => ({
            login: a.login,
            id: a.id,
            avatar_url: a.avatar_url,
            html_url: a.html_url,
            type: a.type,
          })) || [],
        labels:
          item.labels?.map((l: any) => ({
            id: l.id,
            name: l.name,
            color: l.color,
            description: l.description,
            default: l.default,
          })) || [],
        milestone: item.milestone
          ? {
              id: item.milestone.id,
              number: item.milestone.number,
              title: item.milestone.title,
              description: item.milestone.description,
              state: item.milestone.state,
              created_at: item.milestone.created_at,
              updated_at: item.milestone.updated_at,
              due_on: item.milestone.due_on,
              closed_at: item.milestone.closed_at,
            }
          : null,
        locked: item.locked,
        active_lock_reason: item.active_lock_reason,
        comments: item.comments,
        reactions: {
          '+1': item.reactions?.['+1'] || 0,
          '-1': item.reactions?.['-1'] || 0,
          laugh: item.reactions?.laugh || 0,
          hooray: item.reactions?.hooray || 0,
          confused: item.reactions?.confused || 0,
          heart: item.reactions?.heart || 0,
          rocket: item.reactions?.rocket || 0,
          eyes: item.reactions?.eyes || 0,
          total_count: item.reactions?.total_count || 0,
          url: item.reactions?.url || '',
        },
        repository: item.repository
          ? {
              id: item.repository.id,
              name: item.repository.name,
              full_name: item.repository.full_name,
              owner: {
                login: item.repository.owner.login,
                id: item.repository.owner.id,
                type: item.repository.owner.type,
              },
              private: item.repository.private,
              html_url: item.repository.html_url,
              description: item.repository.description,
              fork: item.repository.fork,
              language: item.repository.language,
              stargazers_count: item.repository.stargazers_count,
              watchers_count: item.repository.watchers_count,
              forks_count: item.repository.forks_count,
              open_issues_count: item.repository.open_issues_count,
              default_branch: item.repository.default_branch,
            }
          : undefined,
        score: item.score,
        pull_request: item.pull_request
          ? {
              url: item.pull_request.url,
              html_url: item.pull_request.html_url,
              diff_url: item.pull_request.diff_url,
              patch_url: item.pull_request.patch_url,
              merged_at: item.pull_request.merged_at,
            }
          : undefined,
      };
    });

    return {
      total_count: searchResult.data.total_count,
      incomplete_results: searchResult.data.incomplete_results,
      issues: transformedIssues as any,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return {
      error: `Issue search failed: ${apiError.error}`,
      status: apiError.status,
      hints: [
        'Check if repository exists and is accessible',
        'Verify search parameters are valid',
        'Try simpler search terms',
      ],
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
      type: apiError.type || 'unknown',
    };
  }
}
