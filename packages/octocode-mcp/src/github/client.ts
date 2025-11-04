import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import type { GetRepoResponse } from './githubAPI';
import { getGitHubToken } from '../serverConfig.js';
import { getServerConfig } from '../serverConfig.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { version } from '../../package.json';

// Create Octokit class with throttling plugin
export const OctokitWithThrottling = Octokit.plugin(throttling);

// Octokit instance management
let octokitInstance: InstanceType<typeof OctokitWithThrottling> | null = null;

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

export async function getOctokit(
  authInfo?: AuthInfo
): Promise<InstanceType<typeof OctokitWithThrottling>> {
  if (!octokitInstance || authInfo) {
    const token = authInfo?.token || (await getGitHubToken());
    const baseUrl = 'https://api.github.com';
    const config = getServerConfig();

    const options: OctokitOptions & {
      throttle: ReturnType<typeof createThrottleOptions>;
    } = {
      userAgent: `octocode-mcp/${version}`,
      baseUrl,
      request: { timeout: config.timeout || 30000 },
      throttle: createThrottleOptions(),
      ...(token && { auth: token }),
    };

    octokitInstance = new OctokitWithThrottling(options);
  }
  return octokitInstance;
}

export function clearCachedToken(): void {
  octokitInstance = null;
}

// Simple in-memory cache for default branch results
const defaultBranchCache = new Map<string, string>();

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
