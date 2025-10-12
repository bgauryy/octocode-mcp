/**
 * GitHub User Information and Rate Limiting Enhancement
 *
 * Adds user identification and enhanced rate limiting to GitHub API calls
 */

import { getOctokit } from './client.js';
import { generateCacheKey, withDataCache } from '../utils/cache.js';
import type { GitHubUserInfo, GitHubRateLimitInfo } from '../types.js';

/**
 * Get authenticated user information from GitHub API
 * Caches result for 15 minutes to avoid unnecessary API calls
 */
export async function getAuthenticatedUser(
  sessionId?: string
): Promise<GitHubUserInfo | null> {
  const cacheKey = generateCacheKey('github-user', {}, sessionId);

  const result = await withDataCache<GitHubUserInfo | null>(
    cacheKey,
    async () => {
      try {
        const octokit = await getOctokit();
        const response = await octokit.rest.users.getAuthenticated();

        const userInfo: GitHubUserInfo = {
          login: response.data.login,
          id: response.data.id,
          name: response.data.name,
          email: response.data.email,
          company: response.data.company,
          type: response.data.type as 'User' | 'Organization',
          plan: response.data.plan
            ? {
                name: response.data.plan.name,
                space: response.data.plan.space,
                private_repos: response.data.plan.private_repos,
              }
            : undefined,
        };

        return userInfo;
      } catch (error) {
        // Return null on error - don't cache errors for user info
        return null;
      }
    },
    {
      // Cache for 15 minutes
      ttl: 15 * 60,
      // Only cache successful responses (non-null)
      shouldCache: (value: GitHubUserInfo | null) => value !== null,
    }
  );

  return result;
}

/**
 * Get current rate limit status from GitHub API
 * This provides real-time rate limit information
 */
export async function getRateLimitStatus(): Promise<GitHubRateLimitInfo | null> {
  try {
    const octokit = await getOctokit();
    const response = await octokit.rest.rateLimit.get();

    return {
      core: response.data.resources.core,
      search: response.data.resources.search,
      graphql: response.data.resources.graphql,
    };
  } catch (error) {
    // Failed to get rate limit status - continue without rate limit info
    return null;
  }
}

/**
 * Check if we should proceed with an API call based on rate limits
 * Returns true if we have enough remaining requests, false otherwise
 */
export async function shouldProceedWithAPICall(
  type: 'core' | 'search' | 'graphql' = 'core',
  minRemaining: number = 10
): Promise<{
  canProceed: boolean;
  rateLimitInfo?: GitHubRateLimitInfo;
  waitTime?: number;
}> {
  const rateLimitInfo = await getRateLimitStatus();

  if (!rateLimitInfo) {
    // If we can't get rate limit info, proceed cautiously
    return { canProceed: true };
  }

  const resource = rateLimitInfo[type];
  const canProceed = resource.remaining >= minRemaining;

  if (!canProceed) {
    const resetTime = resource.reset * 1000; // Convert to milliseconds
    const waitTime = Math.max(0, resetTime - Date.now());

    return {
      canProceed: false,
      rateLimitInfo,
      waitTime: Math.ceil(waitTime / 1000), // Return in seconds
    };
  }

  return { canProceed: true, rateLimitInfo };
}

/**
 * Enhanced GitHub API wrapper with rate limiting and user context
 */
export async function withRateLimitedAPI<T>(
  apiCall: () => Promise<T>,
  options: {
    type?: 'core' | 'search' | 'graphql';
    minRemaining?: number;
    waitOnLimit?: boolean;
  } = {}
): Promise<T> {
  const { type = 'core', minRemaining = 10, waitOnLimit = false } = options;

  const rateLimitCheck = await shouldProceedWithAPICall(type, minRemaining);

  if (!rateLimitCheck.canProceed) {
    if (waitOnLimit && rateLimitCheck.waitTime) {
      // Wait for rate limit reset (max 1 hour)
      const waitTime = Math.min(rateLimitCheck.waitTime * 1000, 60 * 60 * 1000);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Retry after waiting
      return withRateLimitedAPI(apiCall, options);
    } else {
      throw new Error(
        `GitHub API rate limit exceeded. ` +
          `${rateLimitCheck.rateLimitInfo?.[type].remaining || 0} requests remaining. ` +
          `Resets in ${rateLimitCheck.waitTime || 'unknown'} seconds.`
      );
    }
  }

  return apiCall();
}

/**
 * Get user context for enterprise features
 * Combines user info with organization membership if applicable
 */
export async function getUserContext(): Promise<{
  user: GitHubUserInfo | null;
  organizationId?: string;
  rateLimits: GitHubRateLimitInfo | null;
}> {
  const [user, rateLimits] = await Promise.all([
    getAuthenticatedUser(),
    getRateLimitStatus(),
  ]);

  // Get organization from environment if configured
  const organizationId = process.env.GITHUB_ORGANIZATION;

  return {
    user,
    organizationId,
    rateLimits,
  };
}
