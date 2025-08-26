import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import type { GetRepoResponse } from './github-openapi';
import { getGitHubToken } from '../serverConfig.js';
import { getServerConfig } from '../serverConfig.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

// Create Octokit class with throttling plugin
export const OctokitWithThrottling = Octokit.plugin(throttling);

// Octokit instance management
let octokitInstance: InstanceType<typeof OctokitWithThrottling> | null = null;

/**
 * Throttle options following official Octokit.js best practices
 */
const createThrottleOptions = () => ({
  onRateLimit: (
    _retryAfter: number,
    _options: unknown,
    _octokit: Octokit,
    retryCount: number
  ) => retryCount === 0,
  onSecondaryRateLimit: (
    _retryAfter: number,
    _options: unknown,
    _octokit: Octokit,
    retryCount: number
  ) => retryCount === 0,
});

/**
 * Initialize Octokit with centralized token management
 * Token resolution is delegated to serverConfig - single source of truth
 */
export async function getOctokit(
  authInfo?: AuthInfo
): Promise<InstanceType<typeof OctokitWithThrottling>> {
  if (!octokitInstance || authInfo) {
    const token = authInfo?.token || (await getGitHubToken());
    const baseUrl = 'https://api.github.com'; // Default GitHub API URL
    const config = getServerConfig();

    const options: OctokitOptions & {
      throttle: ReturnType<typeof createThrottleOptions>;
    } = {
      userAgent: 'octocode-mcp/1.0.0',
      baseUrl,
      request: { timeout: config.timeout || 30000 },
      throttle: createThrottleOptions(),
      ...(token && { auth: token }),
    };

    octokitInstance = new OctokitWithThrottling(options);
  }
  return octokitInstance;
}

/**
 * Clear cached token - delegates to serverConfig
 * Maintains backward compatibility
 */
export function clearCachedToken(): void {
  // Clear local Octokit instance
  octokitInstance = null;

  // The actual token clearing is handled by serverConfig
  // This function is kept for backward compatibility but doesn't manage tokens directly
}

// Simple in-memory cache for default branch results
const defaultBranchCache = new Map<string, string>();

/**
 * Get repository's default branch with caching
 * Token is handled internally by the GitHub client
 */
export async function getDefaultBranch(
  owner: string,
  repo: string
): Promise<string | null> {
  const cacheKey = `${owner}/${repo}`;

  if (defaultBranchCache.has(cacheKey)) {
    return defaultBranchCache.get(cacheKey)!;
  }

  try {
    const octokit = await getOctokit();
    const repoInfo: GetRepoResponse = await octokit.rest.repos.get({
      owner,
      repo,
    });
    const defaultBranch = repoInfo.data.default_branch || 'main';

    defaultBranchCache.set(cacheKey, defaultBranch);
    return defaultBranch;
  } catch (error) {
    return null;
  }
}

// No cleanup needed for simplified token management
