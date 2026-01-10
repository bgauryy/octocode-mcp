import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import { createHash } from 'crypto';
import { getGitHubToken } from '../serverConfig.js';
import { getServerConfig } from '../serverConfig.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { version } from '../../package.json';

/**
 * Hash a token for use as a Map key.
 * Prevents raw tokens from appearing in memory dumps or debug output.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').substring(0, 16);
}

export const OctokitWithThrottling = Octokit.plugin(throttling);

/**
 * Time-to-live for cached Octokit instances (5 minutes).
 * Short TTL ensures refreshed tokens are picked up promptly after expiry/refresh.
 * GitHub App tokens last ~8 hours, so 5 min cache provides good balance
 * between performance and token freshness.
 */
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cached Octokit instance with creation timestamp for TTL checks.
 */
interface CachedInstance {
  client: InstanceType<typeof OctokitWithThrottling>;
  createdAt: number;
}

/**
 * Check if a cached instance has expired based on TTL.
 */
function isExpired(cached: CachedInstance): boolean {
  return Date.now() - cached.createdAt > TOKEN_TTL_MS;
}

// Cache instances by token hash (or 'DEFAULT' for the default token)
const instances = new Map<string, CachedInstance>();
// Track pending default creation to handle race conditions
let pendingDefaultPromise: Promise<
  InstanceType<typeof OctokitWithThrottling>
> | null = null;

/**
 * Maximum number of retries for rate-limited requests.
 */
const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Maximum wait time (in seconds) before refusing to retry.
 * Prevents waiting too long for rate limit reset.
 */
const MAX_RETRY_AFTER_SECONDS = 60;

const createThrottleOptions = () => ({
  onRateLimit: (
    retryAfter: number,
    options: { method: string; url: string },
    _octokit: Octokit,
    retryCount: number
  ) => {
    // eslint-disable-next-line no-console
    console.warn(
      `Rate limit hit for ${options.method} ${options.url}, ` +
        `retry ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES} after ${retryAfter}s`
    );
    // Retry if under max retries and wait is reasonable
    return (
      retryCount < MAX_RATE_LIMIT_RETRIES &&
      retryAfter < MAX_RETRY_AFTER_SECONDS
    );
  },
  onSecondaryRateLimit: (
    retryAfter: number,
    options: { method: string; url: string },
    _octokit: Octokit,
    retryCount: number
  ) => {
    // eslint-disable-next-line no-console
    console.warn(
      `Secondary rate limit hit for ${options.method} ${options.url}, ` +
        `retry ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES} after ${retryAfter}s`
    );
    return (
      retryCount < MAX_RATE_LIMIT_RETRIES &&
      retryAfter < MAX_RETRY_AFTER_SECONDS
    );
  },
});

function createOctokitInstance(
  token?: string
): InstanceType<typeof OctokitWithThrottling> {
  const config = getServerConfig();
  const baseUrl = config.githubApiUrl;

  const options: OctokitOptions & {
    throttle: ReturnType<typeof createThrottleOptions>;
  } = {
    userAgent: `octocode-mcp/${version}`,
    baseUrl,
    request: { timeout: config.timeout || 30000 },
    throttle: createThrottleOptions(),
    ...(token && { auth: token }),
  };

  return new OctokitWithThrottling(options);
}

export async function getOctokit(
  authInfo?: AuthInfo
): Promise<InstanceType<typeof OctokitWithThrottling>> {
  // Case 1: Specific Auth Info provided
  if (authInfo?.token) {
    // Use hashed token as key to avoid storing raw tokens in memory
    const key = hashToken(authInfo.token);
    const cached = instances.get(key);

    // Check if cached instance exists and is not expired
    if (cached && !isExpired(cached)) {
      return cached.client;
    }

    // Create new instance (either doesn't exist or expired)
    const newInstance = createOctokitInstance(authInfo.token);
    instances.set(key, { client: newInstance, createdAt: Date.now() });
    return newInstance;
  }

  // Case 2: Default instance already exists and not expired
  const defaultCached = instances.get('DEFAULT');
  if (defaultCached && !isExpired(defaultCached)) {
    return defaultCached.client;
  }

  // Case 3: Default instance being created (race condition protection)
  if (pendingDefaultPromise) {
    return pendingDefaultPromise;
  }

  // Case 4: Create new default instance
  pendingDefaultPromise = (async () => {
    try {
      const token = await getGitHubToken();
      const instance = createOctokitInstance(token ?? undefined);
      instances.set('DEFAULT', { client: instance, createdAt: Date.now() });
      return instance;
    } finally {
      pendingDefaultPromise = null;
    }
  })();

  return pendingDefaultPromise;
}

/**
 * Clear all cached Octokit instances.
 * Used for testing or when a full reset is needed.
 */
export function clearOctokitInstances(): void {
  instances.clear();
  pendingDefaultPromise = null;
}
