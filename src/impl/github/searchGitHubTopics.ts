import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GitHubSearchResult, GitHubTopicsSearchParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';
import { TOOL_NAMES } from '../../mcp/systemPrompts';

export async function searchGitHubTopics(
  params: GitHubTopicsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-topics', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubTopicsAPICommand(params);
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
        const topics = parsedResults?.items || [];
        totalCount = Array.isArray(topics) ? topics.length : 0;
      } catch {
        parsedResults = content;
      }

      const searchResult: GitHubSearchResult = {
        searchType: 'topics',
        query: params.query || '',
        results: parsedResults,
        rawOutput: content,
        ...(totalCount === 0 && {
          suggestions: [
            `${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${params.query || 'package'}"`,
            `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${params.query || 'repo'}" stars:>100`,
            `${TOOL_NAMES.GITHUB_SEARCH_CODE} "${params.query || 'code'}" language:javascript`,
            `${TOOL_NAMES.GITHUB_SEARCH_USERS} "${params.query || 'user'}"`,
          ],
        }),
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub topics', error);
    }
  });
}

function buildGitHubTopicsAPICommand(params: GitHubTopicsSearchParams): {
  command: string;
  args: string[];
} {
  // Build GitHub API search query for topics
  const searchQuery = params.query || '';

  // Add filters to the search query
  const queryParts = [searchQuery];

  if (params.featured) queryParts.push('is:featured');
  if (params.curated) queryParts.push('is:curated');
  if (params.repositories)
    queryParts.push(`repositories:${params.repositories}`);
  if (params.created) queryParts.push(`created:${params.created}`);

  const finalQuery = queryParts.join(' ').trim();

  // Use GitHub API to search topics
  let apiPath = 'search/topics';
  const queryParams: string[] = [];

  if (finalQuery) {
    queryParams.push(`q=${encodeURIComponent(finalQuery)}`);
  }

  // Add pagination parameters
  const limit = params.limit || 30;
  queryParams.push(`per_page=${limit}`);

  // Add owner parameter if provided
  if (params.owner) {
    queryParams.push(`owner=${encodeURIComponent(params.owner)}`);
  }

  if (params.sort) queryParams.push(`sort=${params.sort}`);
  if (params.order) queryParams.push(`order=${params.order}`);

  if (queryParams.length > 0) {
    apiPath += `?${queryParams.join('&')}`;
  }

  return { command: 'api', args: [apiPath] };
}
