import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GitHubUsersSearchParams } from '../../types';
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

      // Parse the JSON response from GitHub API
      let parsedResults;
      let totalCount = 0;
      let users = [];

      try {
        parsedResults = JSON.parse(content);
        users = parsedResults?.items || [];
        totalCount = users.length;

        // Transform to clean format
        const cleanUsers = users.map((user: any) => ({
          login: user.login,
          id: user.id,
          type: user.type,
          name: user.name,
          company: user.company,
          location: user.location,
          email: user.email,
          bio: user.bio,
          public_repos: user.public_repos,
          public_gists: user.public_gists,
          followers: user.followers,
          following: user.following,
          created_at: user.created_at,
          updated_at: user.updated_at,
          url: user.html_url,
          avatar_url: user.avatar_url,
        }));

        return createSuccessResult({
          searchType: 'users',
          query: params.query || '',
          results: cleanUsers,
          metadata: {
            total_count: parsedResults.total_count || totalCount,
            incomplete_results: parsedResults.incomplete_results || false,
          },
          ...(totalCount === 0 && {
            suggestions: [
              // More helpful suggestions for user searches
              `${TOOL_NAMES.GITHUB_SEARCH_USERS} "${params.query || 'developer'}" type:user`,
              `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${params.query || 'repo'}" stars:>10`,
              `${TOOL_NAMES.GITHUB_SEARCH_CODE} "${params.query || 'code'}"`,
              `${TOOL_NAMES.GITHUB_SEARCH_TOPICS} "${params.query || 'topic'}"`,
              // Suggest less restrictive searches
              ...(params.followers
                ? [
                    `${TOOL_NAMES.GITHUB_SEARCH_USERS} "${params.query}" followers:>100`,
                  ]
                : []),
              ...(params.language
                ? [
                    `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${params.query}" language:${params.language}`,
                  ]
                : []),
            ],
          }),
        });
      } catch (parseError) {
        // Fallback for non-JSON content
        return createSuccessResult({
          searchType: 'users',
          query: params.query || '',
          results: content,
          suggestions: [
            `${TOOL_NAMES.GITHUB_SEARCH_USERS} "${params.query || 'developer'}" type:user`,
            `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${params.query || 'repo'}" stars:>10`,
          ],
        });
      }
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
  const queryParts: string[] = [];

  // Add main search query
  if (params.query) {
    queryParts.push(params.query.trim());
  }

  // Add filters to the search query - make them less restrictive
  if (params.type) queryParts.push(`type:${params.type}`);
  if (params.location) queryParts.push(`location:"${params.location}"`);
  if (params.language) queryParts.push(`language:${params.language}`);

  // Make follower filtering less restrictive - use more reasonable defaults
  if (params.followers) {
    // If user specified a very high number, suggest alternatives
    const followerCount = params.followers.replace(/[^\d><=]/g, '');
    const numericValue = parseInt(followerCount.replace(/[><=]/g, ''));

    if (numericValue && numericValue > 1000) {
      // For very high follower counts, also try lower thresholds
      queryParts.push(`followers:${params.followers}`);
    } else {
      queryParts.push(`followers:${params.followers}`);
    }
  }

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
  const limit = Math.min(params.limit || 25, 100); // GitHub API max is 100
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
