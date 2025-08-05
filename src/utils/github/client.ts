import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import { logger } from '../logger.js';
import type {
  GetRepoParameters,
  GetRepoResponse,
} from '../../types/github-openapi';

// Throttling options interface
interface ThrottleOptions {
  method: string;
  url: string;
  [key: string]: unknown;
}

// TypeScript-safe conditional authentication
const defaultToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

// Create Octokit class with throttling plugin
export const OctokitWithThrottling = Octokit.plugin(throttling);

// Cache Octokit instances by token with size limit
const octokitInstances = new Map<
  string,
  InstanceType<typeof OctokitWithThrottling>
>();

// Limit Octokit instances to prevent memory leaks
const MAX_OCTOKIT_INSTANCES = 10;

/**
 * Throttle options following official Octokit.js best practices
 */
const createThrottleOptions = () => ({
  onRateLimit: (
    retryAfter: number,
    options: ThrottleOptions,
    _octokit: Octokit,
    retryCount: number
  ) => {
    // Log rate limit with detailed context
    logger.warn('GitHub API rate limit exceeded', {
      method: options.method,
      url: options.url,
      retryCount,
      retryAfter,
    });

    // Only retry once
    if (retryCount === 0) {
      logger.info('Retrying GitHub API request after rate limit', {
        retryAfter,
        method: options.method,
        url: options.url,
      });
      return true;
    }

    logger.warn('Rate limit retry limit reached, not retrying', {
      method: options.method,
      url: options.url,
    });
    return false;
  },
  onSecondaryRateLimit: (
    retryAfter: number,
    options: ThrottleOptions,
    _octokit: Octokit,
    retryCount: number
  ) => {
    // Log secondary rate limit (abuse detection pattern)
    logger.warn('GitHub API secondary rate limit detected', {
      method: options.method,
      url: options.url,
      retryCount,
      retryAfter,
    });

    // Retry once for secondary rate limits too
    if (retryCount === 0) {
      logger.info('Retrying after secondary rate limit', {
        retryAfter,
        method: options.method,
        url: options.url,
      });
      return true;
    }

    logger.warn('Secondary rate limit retry limit reached, not retrying', {
      method: options.method,
      url: options.url,
    });
    return false;
  },
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
      // Remove the oldest instance (first in Map)
      const oldestKey = octokitInstances.keys().next().value;
      if (oldestKey) {
        octokitInstances.delete(oldestKey);
        logger.debug('Removed oldest Octokit instance to prevent memory leak', {
          removedKey: oldestKey.substring(0, 10) + '...',
          remainingInstances: octokitInstances.size,
        });
      }
    }

    // TypeScript-safe configuration with throttling plugin
    const options: OctokitOptions & {
      throttle: ReturnType<typeof createThrottleOptions>;
    } = {
      userAgent: 'octocode-mcp/1.0.0',
      request: {
        timeout: 30000, // 30 second timeout
      },
      // Use the separated throttle options for better maintainability
      throttle: createThrottleOptions(),
    };

    if (useToken) {
      options.auth = useToken;
    }

    octokitInstances.set(cacheKey, new OctokitWithThrottling(options));

    logger.debug('Created new Octokit instance', {
      cacheKey: cacheKey.substring(0, 10) + '...',
      totalInstances: octokitInstances.size,
    });
  }
  return octokitInstances.get(cacheKey)!;
}

// Simple in-memory cache for default branch results
const defaultBranchCache = new Map<string, string>();

/**
 * Get repository's default branch with caching
 * Works for both CLI and API implementations
 */
export async function getDefaultBranch(
  owner: string,
  repo: string,
  token?: string
): Promise<string | null> {
  const cacheKey = `${owner}/${repo}`;

  // Check cache first
  if (defaultBranchCache.has(cacheKey)) {
    return defaultBranchCache.get(cacheKey)!;
  }

  try {
    const octokit = getOctokit(token);
    const params: GetRepoParameters = { owner, repo };
    const repoInfo: GetRepoResponse = await octokit.rest.repos.get(params);
    const defaultBranch = repoInfo.data.default_branch || 'main';

    // Cache the successful result
    defaultBranchCache.set(cacheKey, defaultBranch);
    return defaultBranch;
  } catch (error) {
    // Fallback: try to infer from common patterns
    // Don't cache failures to allow retry later
    return null;
  }
}
