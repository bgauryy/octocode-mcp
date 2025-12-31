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

// Cache instances by token (or 'DEFAULT' for the default token)
const instances = new Map<string, InstanceType<typeof OctokitWithThrottling>>();
// Track pending default creation to handle race conditions
let pendingDefaultPromise: Promise<
  InstanceType<typeof OctokitWithThrottling>
> | null = null;

const createThrottleOptions = () => ({
  onRateLimit: (
    _retryAfter: number,
    _options: unknown,
    _octokit: Octokit,
    _retryCount: number
  ) => false,
  onSecondaryRateLimit: (
    _retryAfter: number,
    _options: unknown,
    _octokit: Octokit,
    _retryCount: number
  ) => false,
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
    if (!instances.has(key)) {
      instances.set(key, createOctokitInstance(authInfo.token));
    }
    return instances.get(key)!;
  }

  // Case 2: Default instance already exists
  if (instances.has('DEFAULT')) {
    return instances.get('DEFAULT')!;
  }

  // Case 3: Default instance being created (race condition protection)
  if (pendingDefaultPromise) {
    return pendingDefaultPromise;
  }

  // Case 4: Create new default instance
  pendingDefaultPromise = (async () => {
    try {
      const token = await getGitHubToken();
      const instance = createOctokitInstance(token);
      instances.set('DEFAULT', instance);
      return instance;
    } finally {
      pendingDefaultPromise = null;
    }
  })();

  return pendingDefaultPromise;
}

export function clearOctokitInstances(): void {
  instances.clear();
  pendingDefaultPromise = null;
}
