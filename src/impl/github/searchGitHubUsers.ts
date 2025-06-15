import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GitHubSearchResult, GitHubUsersSearchParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';
import { TOOL_NAMES } from '../../mcp/systemPrompts';

export async function searchGitHubUsers(
  params: GitHubUsersSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-users', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubUsersAPICommand(params);
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
        const users = parsedResults?.items || [];
        totalCount = Array.isArray(users) ? users.length : 0;
      } catch {
        parsedResults = content;
      }

      const searchResult: GitHubSearchResult = {
        searchType: 'users',
        query: params.query || '',
        results: parsedResults,
        rawOutput: content,
        ...(totalCount === 0 && {
          suggestions: [
            `${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${params.query || 'package'}"`,
            `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${params.query || 'repo'}" user:${params.query}`,
            `${TOOL_NAMES.GITHUB_SEARCH_TOPICS} "${params.query || 'topic'}"`,
            `${TOOL_NAMES.GITHUB_SEARCH_CODE} "${params.query || 'code'}"`,
          ],
        }),
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub users', error);
    }
  });
}

function buildGitHubUsersAPICommand(params: GitHubUsersSearchParams): {
  command: string;
  args: string[];
} {
  // Build GitHub API search query for users
  const searchQuery = params.query || '';

  // Add filters to the search query
  const queryParts = [searchQuery];

  if (params.type) queryParts.push(`type:${params.type}`);
  if (params.location) queryParts.push(`location:"${params.location}"`);
  if (params.language) queryParts.push(`language:${params.language}`);
  if (params.followers) queryParts.push(`followers:${params.followers}`);
  if (params.repos) queryParts.push(`repos:${params.repos}`);
  if (params.created) queryParts.push(`created:${params.created}`);

  const finalQuery = queryParts.join(' ').trim();

  // Use GitHub API to search users
  let apiPath = 'search/users';
  const queryParams: string[] = [];

  if (finalQuery) {
    queryParams.push(`q=${encodeURIComponent(finalQuery)}`);
  }

  // Add pagination parameters
  const limit = params.limit || 30;
  queryParams.push(`per_page=${limit}`);

  const page = params.page || 1;
  queryParams.push(`page=${page}`);

  if (params.sort) queryParams.push(`sort=${params.sort}`);
  if (params.order) queryParams.push(`order=${params.order}`);

  if (queryParams.length > 0) {
    apiPath += `?${queryParams.join('&')}`;
  }

  return { command: 'api', args: [apiPath] };
}
