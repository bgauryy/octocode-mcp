import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import type { GetRepoResponse } from '../../types/github-openapi';

// TypeScript-safe conditional authentication
const defaultToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

// Create Octokit class with throttling plugin
export const OctokitWithThrottling = Octokit.plugin(throttling);

// Cache Octokit instances by token with size limit
const octokitInstances = new Map<
  string,
  InstanceType<typeof OctokitWithThrottling>
>();
const MAX_OCTOKIT_INSTANCES = 10;

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
 * Initialize Octokit with TypeScript-safe authentication and throttling plugin
 * GitHub API client initialization
 */
export function getOctokit(
  token?: string
): InstanceType<typeof OctokitWithThrottling> {
  const useToken = token || defaultToken || '';
  const cacheKey = useToken || 'no-token';

  if (!octokitInstances.has(cacheKey)) {
    // Prevent memory leaks by limiting the number of cached instances
    if (octokitInstances.size >= MAX_OCTOKIT_INSTANCES) {
      const oldestKey = octokitInstances.keys().next().value;
      if (oldestKey) {
        octokitInstances.delete(oldestKey);
      }
    }

    const options: OctokitOptions & {
      throttle: ReturnType<typeof createThrottleOptions>;
    } = {
      userAgent: 'octocode-mcp/1.0.0',
      request: { timeout: 30000 },
      throttle: createThrottleOptions(),
      ...(useToken && { auth: useToken }),
    };

    octokitInstances.set(cacheKey, new OctokitWithThrottling(options));
  }
  return octokitInstances.get(cacheKey)!;
}

// Simple in-memory cache for default branch results
const defaultBranchCache = new Map<string, string>();

/**
 * Get repository's default branch with caching
 */
export async function getDefaultBranch(
  owner: string,
  repo: string,
  token?: string
): Promise<string | null> {
  const cacheKey = `${owner}/${repo}`;

  if (defaultBranchCache.has(cacheKey)) {
    return defaultBranchCache.get(cacheKey)!;
  }

  try {
    const octokit = getOctokit(token);
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
