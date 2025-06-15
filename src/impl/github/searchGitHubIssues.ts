import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GitHubIssuesSearchParams } from '../../types';
import { createErrorResult, createSuccessResult, needsQuoting } from '../util';

export async function searchGitHubIssues(
  params: GitHubIssuesSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-issues', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubIssuesSearchCommand(params);
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

      // Return the parsed results directly without wrapping in GitHubSearchResult
      return createSuccessResult({
        searchType: 'issues',
        query: params.query || '',
        results: parsedResults,
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
    } catch (error) {
      return createErrorResult('Failed to search GitHub issues', error);
    }
  });
}

function buildGitHubIssuesSearchCommand(params: GitHubIssuesSearchParams): {
  command: string;
  args: string[];
} {
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

  const args = ['issues', queryString];

  // Add individual flags for additional qualifiers
  if (params.app) args.push(`--app=${params.app}`);
  if (params.archived !== undefined) args.push(`--archived=${params.archived}`);
  if (params.author) args.push(`--author=${params.author}`);
  if (params.assignee) args.push(`--assignee=${params.assignee}`);
  if (params.closed) args.push(`--closed=${params.closed}`);
  if (params.commenter) args.push(`--commenter=${params.commenter}`);
  if (params.comments !== undefined) args.push(`--comments=${params.comments}`);
  if (params.created) args.push(`--created=${params.created}`);
  if (params.includePrs !== undefined) args.push(`--include-prs`);
  if (params.interactions !== undefined)
    args.push(`--interactions=${params.interactions}`);
  if (params.involves) args.push(`--involves=${params.involves}`);
  if (params.labels) args.push(`--label=${params.labels}`);
  if (params.language) args.push(`--language=${params.language}`);
  if (params.locked !== undefined) args.push(`--locked=${params.locked}`);
  if (params.match) args.push(`--match=${params.match}`);
  if (params.mentions) args.push(`--mentions=${params.mentions}`);
  if (params.milestone) args.push(`--milestone=${params.milestone}`);
  if (params.noAssignee !== undefined) args.push(`--no-assignee`);
  if (params.noLabel !== undefined) args.push(`--no-label`);
  if (params.noMilestone !== undefined) args.push(`--no-milestone`);
  if (params.noProject !== undefined) args.push(`--no-project`);
  if (params.project) args.push(`--project=${params.project}`);
  if (params.reactions !== undefined)
    args.push(`--reactions=${params.reactions}`);
  if (params.state) args.push(`--state=${params.state}`);
  if (params.teamMentions) args.push(`--team-mentions=${params.teamMentions}`);
  if (params.updated) args.push(`--updated=${params.updated}`);
  if (params.visibility) args.push(`--visibility=${params.visibility}`);
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.sort) args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);

  return { command: 'search', args };
}
