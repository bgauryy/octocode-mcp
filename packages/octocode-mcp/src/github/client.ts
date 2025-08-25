import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import type { GetRepoResponse } from './types';
import { getGitHubToken } from '../../config.js';
import { ConfigManager } from '../config/serverConfig.js';

// Create Octokit class with throttling plugin
export const OctokitWithThrottling = Octokit.plugin(throttling);

// Simple Octokit instance management
let octokitInstance: InstanceType<typeof OctokitWithThrottling> | null = null;
let lastTokenUsed: string | null = null;

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
 * Initialize Octokit with simple token management
 * Automatically reinitializes if token changes (config.ts handles token refresh)
 */
export async function getOctokit(): Promise<
  InstanceType<typeof OctokitWithThrottling>
> {
  const token = await getGitHubToken();

  // Reinitialize if token changed or no instance exists
  if (!octokitInstance || lastTokenUsed !== token) {
    const config = ConfigManager.getConfig();
    const baseUrl = 'https://api.github.com';
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
    lastTokenUsed = token;

    // Clear default branch cache when token changes for security
    if (lastTokenUsed !== token) {
      defaultBranchCache.clear();
    }
  }

  return octokitInstance;
}

/**
 * Clear cached client instance
 * Forces re-initialization on next call
 */
export function clearCachedToken(): void {
  // Clear local Octokit instance
  octokitInstance = null;
  lastTokenUsed = null;

  // Clear default branch cache for security
  defaultBranchCache.clear();
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

// Clean up on process exit - handled by config.ts cleanup()
