import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GitHubCommitsSearchParams, GitHubSearchResult } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult, needsQuoting } from '../util';
import { executeGitHubCommand } from '../../utils/exec';

export async function searchGitHubCommits(
  params: GitHubCommitsSearchParams
): Promise<CallToolResult> {
  // Validate required query parameter
  if (!params.query || params.query.trim() === '') {
    return createErrorResult(
      'Search query required',
      new Error('GitHub commit search requires a non-empty query parameter')
    );
  }

  const cacheKey = generateCacheKey('gh-commits', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubCommitsSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const searchResult: GitHubSearchResult = {
        searchType: 'commits',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub commits', error);
    }
  });
}

function buildGitHubCommitsSearchCommand(params: GitHubCommitsSearchParams): {
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

  const args = ['commits', queryString];

  // Add individual flags for additional qualifiers
  if (params.author) args.push(`--author=${params.author}`);
  if (params.committer) args.push(`--committer=${params.committer}`);
  if (params.authorDate) args.push(`--author-date=${params.authorDate}`);
  if (params.committerDate)
    args.push(`--committer-date=${params.committerDate}`);
  if (params.authorEmail) args.push(`--author-email=${params.authorEmail}`);
  if (params.authorName) args.push(`--author-name="${params.authorName}"`);
  if (params.committerEmail)
    args.push(`--committer-email=${params.committerEmail}`);
  if (params.committerName)
    args.push(`--committer-name="${params.committerName}"`);
  if (params.merge !== undefined) args.push(`--merge`);
  if (params.hash) args.push(`--hash=${params.hash}`);
  if (params.parent) args.push(`--parent=${params.parent}`);
  if (params.tree) args.push(`--tree=${params.tree}`);
  if (params.visibility) args.push(`--visibility=${params.visibility}`);
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.sort && params.sort !== 'best-match')
    args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);

  return { command: 'search', args };
}
