import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import type { GetRepoResponse } from '../../types/github-openapi';

// TypeScript-safe conditional authentication
const defaultToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

// Create Octokit class with throttling plugin
export const OctokitWithThrottling = Octokit.plugin(throttling);

// Single Octokit instance since we only use one token
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
 * Initialize Octokit with TypeScript-safe authentication and throttling plugin
 * GitHub API client initialization
 */
export function getOctokit(
  token?: string
): InstanceType<typeof OctokitWithThrottling> {
  if (!octokitInstance) {
    const useToken = token || defaultToken || '';

    const options: OctokitOptions & {
      throttle: ReturnType<typeof createThrottleOptions>;
    } = {
      userAgent: 'octocode-mcp/1.0.0',
      request: { timeout: 30000 },
      throttle: createThrottleOptions(),
      ...(useToken && { auth: useToken }),
    };

    octokitInstance = new OctokitWithThrottling(options);
  }
  return octokitInstance;
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

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(tokenInput: string): string | null {
  if (!tokenInput) return '';

  // Start by trimming the entire input
  let token = tokenInput.trim();

  // Remove "Bearer " prefix (case-insensitive) - get next word after Bearer
  token = token.replace(/^bearer\s+/i, '');

  // Remove "token " prefix (case insensitive)
  token = token.replace(/^token\s+/i, '');

  // Handle template format {{token}} - extract the actual token
  token = token.replace(/^\{\{(.+)\}\}$/, '$1');

  // Final trim to clean up any remaining whitespace
  return token.trim();
}
