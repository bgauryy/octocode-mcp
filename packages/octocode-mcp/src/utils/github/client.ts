import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import type { GetRepoResponse } from '../../types/github-openapi';
import {
  getGitHubToken,
  onTokenRotated,
} from '../../mcp/tools/utils/tokenManager.js';
import { ConfigManager } from '../../config/serverConfig.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

// Create Octokit class with throttling plugin
export const OctokitWithThrottling = Octokit.plugin(throttling);

// Octokit instance management with token rotation support
let octokitInstance: InstanceType<typeof OctokitWithThrottling> | null = null;
let tokenRotationCleanup: (() => void) | null = null;

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
 * Initialize Octokit with centralized token management and rotation support
 * Token resolution is delegated to tokenManager - single source of truth
 */
export async function getOctokit(
  authInfo?: AuthInfo
): Promise<InstanceType<typeof OctokitWithThrottling>> {
  if (!octokitInstance || authInfo) {
    const token = authInfo?.token || (await getGitHubToken());
    const baseUrl = ConfigManager.getGitHubBaseURL();
    const config = ConfigManager.getConfig();

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

    // Subscribe to token rotation events for automatic re-initialization
    tokenRotationCleanup = onTokenRotated(async () => {
      // Force re-initialization with the new token on next call
      // Note: existing lightweight caches such as default branch values are token-agnostic
      // and can remain intact. Only Octokit authentication must refresh.
      octokitInstance = null;
    });
  }
  return octokitInstance;
}

/**
 * Clear cached token - delegates to centralized token manager
 * Maintains backward compatibility
 */
export function clearCachedToken(): void {
  // Clear local Octokit instance
  octokitInstance = null;

  // The actual token clearing is handled by tokenManager
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

// Clean up on process exit
process.on('exit', () => {
  if (tokenRotationCleanup) {
    tokenRotationCleanup();
  }
});
