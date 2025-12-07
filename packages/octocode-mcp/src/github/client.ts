import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import { getGitHubToken } from '../serverConfig.js';
import { getServerConfig } from '../serverConfig.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { version } from '../../package.json';

export const OctokitWithThrottling = Octokit.plugin(throttling);

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

    octokitInstance = new OctokitWithThrottling(options);
  }
  return octokitInstance;
}

export function clearCachedToken(): void {
  octokitInstance = null;
}
