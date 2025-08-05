import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../../mcp/responses';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import type { GetAuthenticatedUserResponse } from '../../types/github-openapi';

/**
 * Check GitHub API authentication status with proper typing
 */
export async function checkGitHubAuthAPI(
  token?: string
): Promise<CallToolResult> {
  try {
    const octokit = getOctokit(token);
    const result: GetAuthenticatedUserResponse =
      await octokit.rest.users.getAuthenticated();

    return createResult({
      data: {
        authenticated: true,
        user: result.data.login,
        name: result.data.name,
        type: result.data.type,
        rateLimit: {
          remaining: result.headers['x-ratelimit-remaining'],
          limit: result.headers['x-ratelimit-limit'],
          reset: result.headers['x-ratelimit-reset'],
        },
      },
    });
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);

    if (apiError.status === 401) {
      return createResult({
        data: {
          authenticated: false,
          message: 'No valid authentication found',
          hint: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
        },
      });
    }

    return createResult({
      isError: true,
      hints: [`Authentication check failed: ${apiError.error}`],
    });
  }
}
