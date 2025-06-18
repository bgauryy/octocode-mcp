import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GitHubPullRequestsSearchParams } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult } from '../util';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';

export async function searchGitHubPullRequests(
  params: GitHubPullRequestsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-prs', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubPullRequestsAPICommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      // Parse the JSON response from GitHub API
      let parsedResults;
      let totalCount = 0;
      let pullRequests = [];

      try {
        parsedResults = JSON.parse(content);
        pullRequests = parsedResults?.items || [];
        totalCount = pullRequests.length;

        // Transform to clean format
        const cleanPRs = pullRequests.map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.user?.login,
          repository:
            pr.repository_url?.split('/').slice(-2).join('/') || 'unknown',
          labels: pr.labels?.map((l: any) => l.name) || [],
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          merged_at: pr.merged_at,
          closed_at: pr.closed_at,
          url: pr.html_url,
          comments: pr.comments,
          reactions: pr.reactions?.total_count || 0,
          draft: pr.draft,
          head: pr.head?.ref,
          base: pr.base?.ref,
        }));

        return createSuccessResult({
          searchType: 'prs',
          query: params.query || '',
          results: cleanPRs,
          metadata: {
            total_count: parsedResults.total_count || totalCount,
            incomplete_results: parsedResults.incomplete_results || false,
          },
          ...(totalCount === 0 && {
            suggestions: [
              `npm_search_packages "${params.query || 'package'}"`,
              `github_search_issues "${params.query || 'issue'}"`,
              `github_search_commits "${params.query || 'commit'}"`,
              ...(params.owner
                ? [`github_search_code "${params.query}" owner:${params.owner}`]
                : []),
            ],
          }),
        });
      } catch (parseError) {
        // Fallback for non-JSON content
        return createSuccessResult({
          searchType: 'prs',
          query: params.query || '',
          results: content,
          suggestions: [
            `npm_search_packages "${params.query || 'package'}"`,
            `github_search_issues "${params.query || 'issue'}"`,
          ],
        });
      }
    } catch (error) {
      return createErrorResult('Failed to search GitHub pull requests', error);
    }
  });
}

export function buildGitHubPullRequestsAPICommand(
  params: GitHubPullRequestsSearchParams
): { command: GhCommand; args: string[] } {
  // Build GitHub API search query for pull requests
  const queryParts: string[] = [];

  // Add main search query
  if (params.query) {
    queryParts.push(params.query.trim());
  }

  // Add repository/organization qualifiers
  if (params.owner && params.repo) {
    queryParts.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    queryParts.push(`org:${params.owner}`);
  }

  // Add other search qualifiers
  if (params.author) queryParts.push(`author:${params.author}`);
  if (params.assignee) queryParts.push(`assignee:${params.assignee}`);
  if (params.mentions) queryParts.push(`mentions:${params.mentions}`);
  if (params.commenter) queryParts.push(`commenter:${params.commenter}`);
  if (params.involves) queryParts.push(`involves:${params.involves}`);
  if (params.reviewedBy) queryParts.push(`reviewed-by:${params.reviewedBy}`);
  if (params.reviewRequested)
    queryParts.push(`review-requested:${params.reviewRequested}`);
  if (params.state) queryParts.push(`state:${params.state}`);
  if (params.head) queryParts.push(`head:${params.head}`);
  if (params.base) queryParts.push(`base:${params.base}`);
  if (params.language) queryParts.push(`language:${params.language}`);
  if (params.created) queryParts.push(`created:${params.created}`);
  if (params.updated) queryParts.push(`updated:${params.updated}`);
  if (params.mergedAt) queryParts.push(`merged:${params.mergedAt}`);
  if (params.closed) queryParts.push(`closed:${params.closed}`);
  if (params.draft !== undefined) queryParts.push(`draft:${params.draft}`);

  // Add type qualifier to search only pull requests
  queryParts.push('type:pr');

  const finalQuery = queryParts.join(' ').trim();

  // Use GitHub API to search issues (PRs are issues in GitHub API)
  let apiPath = 'search/issues';
  const queryParams: string[] = [];

  if (finalQuery) {
    queryParams.push(`q=${encodeURIComponent(finalQuery)}`);
  }

  // Add pagination and sorting parameters
  const limit = Math.min(params.limit || 25, 100); // GitHub API max is 100
  queryParams.push(`per_page=${limit}`);

  if (params.sort) queryParams.push(`sort=${params.sort}`);
  if (params.order) queryParams.push(`order=${params.order}`);

  if (queryParams.length > 0) {
    apiPath += `?${queryParams.join('&')}`;
  }

  return { command: 'api', args: [apiPath] };
}
