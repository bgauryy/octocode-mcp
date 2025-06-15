import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GitHubIssuesSearchParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function searchGitHubIssues(
  params: GitHubIssuesSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-issues', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubIssuesAPICommand(params);
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
      let issues = [];

      try {
        parsedResults = JSON.parse(content);
        issues = parsedResults?.items || [];
        totalCount = issues.length;

        // Transform to clean format
        const cleanIssues = issues.map((issue: any) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          author: issue.user?.login,
          repository:
            issue.repository_url?.split('/').slice(-2).join('/') || 'unknown',
          labels: issue.labels?.map((l: any) => l.name) || [],
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          url: issue.html_url,
          comments: issue.comments,
          reactions: issue.reactions?.total_count || 0,
        }));

        return createSuccessResult({
          searchType: 'issues',
          query: params.query || '',
          results: cleanIssues,
          metadata: {
            total_count: parsedResults.total_count || totalCount,
            incomplete_results: parsedResults.incomplete_results || false,
          },
          ...(totalCount === 0 && {
            suggestions: [
              `npm_search_packages "${params.query || 'issue'}"`,
              `github_search_repositories "${params.query || 'repo'}" stars:>10`,
              `github_search_pull_requests "${params.query || 'pr'}"`,
              ...(params.owner
                ? [`github_search_code "${params.query}" owner:${params.owner}`]
                : []),
            ],
          }),
        });
      } catch (parseError) {
        // Fallback for non-JSON content
        return createSuccessResult({
          searchType: 'issues',
          query: params.query || '',
          results: content,
          suggestions: [
            `npm_search_packages "${params.query || 'issue'}"`,
            `github_search_repositories "${params.query || 'repo'}" stars:>10`,
          ],
        });
      }
    } catch (error) {
      return createErrorResult('Failed to search GitHub issues', error);
    }
  });
}

function buildGitHubIssuesAPICommand(params: GitHubIssuesSearchParams): {
  command: string;
  args: string[];
} {
  // Build GitHub API search query for issues
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
  if (params.labels) queryParts.push(`label:"${params.labels}"`);
  if (params.language) queryParts.push(`language:${params.language}`);
  if (params.state) queryParts.push(`state:${params.state}`);
  if (params.milestone) queryParts.push(`milestone:"${params.milestone}"`);
  if (params.created) queryParts.push(`created:${params.created}`);
  if (params.updated) queryParts.push(`updated:${params.updated}`);
  if (params.closed) queryParts.push(`closed:${params.closed}`);
  if (params.noAssignee) queryParts.push(`no:assignee`);
  if (params.noLabel) queryParts.push(`no:label`);
  if (params.noMilestone) queryParts.push(`no:milestone`);
  if (params.archived !== undefined)
    queryParts.push(`archived:${params.archived}`);
  if (params.locked !== undefined) queryParts.push(`is:locked`);
  if (params.visibility) queryParts.push(`is:${params.visibility}`);

  const finalQuery = queryParts.join(' ').trim();

  // Use GitHub API to search issues
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
