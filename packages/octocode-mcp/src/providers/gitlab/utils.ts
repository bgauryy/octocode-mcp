/**
 * Shared GitLab provider utilities.
 *
 * @module providers/gitlab/utils
 */

import type { ProviderResponse } from '../types.js';

/**
 * Parse a unified projectId into GitLab format.
 * GitLab accepts: numeric ID or URL-encoded path (e.g., "group%2Fproject").
 */
export function parseGitLabProjectId(projectId?: string): number | string {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const numId = parseInt(projectId, 10);
  if (!isNaN(numId) && String(numId) === projectId) {
    return numId;
  }

  return encodeURIComponent(projectId);
}

export function extractGitLabRateLimit(result: {
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  retryAfter?: number;
}): ProviderResponse<never>['rateLimit'] {
  const remaining = result.rateLimitRemaining;
  const reset = result.rateLimitReset;
  const retryAfter = result.retryAfter;

  if (
    remaining === undefined &&
    reset === undefined &&
    retryAfter === undefined
  ) {
    return undefined;
  }

  const computedReset =
    reset ??
    (retryAfter !== undefined
      ? Math.floor(Date.now() / 1000) + retryAfter
      : undefined);

  if (computedReset === undefined) {
    return undefined;
  }

  return {
    remaining: remaining ?? 0,
    reset: computedReset,
    retryAfter,
  };
}
