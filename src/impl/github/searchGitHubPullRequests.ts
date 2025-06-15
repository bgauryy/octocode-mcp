import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  GitHubPullRequestsSearchParams,
  GitHubSearchResult,
} from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult, needsQuoting } from '../util';
import { executeGitHubCommand } from '../../utils/exec';

export async function searchGitHubPullRequests(
  params: GitHubPullRequestsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-prs', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubPullRequestsSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      // Parse and analyze results
      let parsedResults;
      let totalCount = 0;
      try {
        parsedResults = JSON.parse(content);
        totalCount = Array.isArray(parsedResults) ? parsedResults.length : 0;
      } catch {
        parsedResults = content;
      }

      const searchResult: GitHubSearchResult = {
        searchType: 'prs',
        query: params.query || '',
        results: parsedResults,
        rawOutput: content,
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
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub pull requests', error);
    }
  });
}

export function buildGitHubPullRequestsSearchCommand(
  params: GitHubPullRequestsSearchParams
): { command: string; args: string[] } {
  // Build query following GitHub CLI patterns
  const queryParts: string[] = [];

  // Add main search query
  if (params.query) {
    const query = params.query.trim();
    queryParts.push(needsQuoting(query) ? `"${query}"` : query);
  }

  // Add repository/organization qualifiers
  if (params.owner && params.repo) {
    queryParts.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    queryParts.push(`org:${params.owner}`);
  }

  // Construct query string
  const queryString = queryParts.filter(part => part.length > 0).join(' ');

  const args = ['prs', queryString];

  // Add individual flags for additional qualifiers
  if (params.author) args.push(`--author=${params.author}`);
  if (params.assignee) args.push(`--assignee=${params.assignee}`);
  if (params.mentions) args.push(`--mentions=${params.mentions}`);
  if (params.commenter) args.push(`--commenter=${params.commenter}`);
  if (params.involves) args.push(`--involves=${params.involves}`);
  if (params.reviewedBy) args.push(`--reviewed-by=${params.reviewedBy}`);
  if (params.reviewRequested)
    args.push(`--review-requested=${params.reviewRequested}`);
  if (params.state) args.push(`--state=${params.state}`);
  if (params.head) args.push(`--head=${params.head}`);
  if (params.base) args.push(`--base=${params.base}`);
  if (params.language) args.push(`--language=${params.language}`);
  if (params.created) args.push(`--created=${params.created}`);
  if (params.updated) args.push(`--updated=${params.updated}`);
  if (params.merged) args.push(`--merged=${params.merged}`);
  if (params.closed) args.push(`--closed=${params.closed}`);
  if (params.draft !== undefined) args.push(`--draft=${params.draft}`);
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.sort) args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);

  return { command: 'search', args };
}
