/**
 * Bitbucket Client
 *
 * Manages Bitbucket Cloud client instances with caching and configuration.
 * Uses @coderabbitai/bitbucket for typed API calls.
 *
 * @module bitbucket/client
 */

import { BitbucketCloud, toBase64 } from '@coderabbitai/bitbucket';
import { createHash } from 'crypto';
import NodeCache from 'node-cache';
import {
  getBitbucketHost,
  getBitbucketToken,
  getBitbucketUsername,
} from '../bitbucketConfig.js';

type BitbucketClient = ReturnType<
  typeof BitbucketCloud.createBitbucketCloudClient
>;

interface ClientConfig {
  token?: string;
  host?: string;
  username?: string;
}

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_CHECK_PERIOD_SECONDS = 60;

const clientCache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: CACHE_CHECK_PERIOD_SECONDS,
  useClones: false,
});

function hashToken(token?: string): string {
  if (!token) return 'default';
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

function getCacheKey(config?: ClientConfig): string {
  const host = config?.host || getBitbucketHost();
  const tokenHash = hashToken(
    config?.token || getBitbucketToken() || undefined
  );
  return `bitbucket:${host}:${tokenHash}`;
}

export function getBitbucketClient(config?: ClientConfig): BitbucketClient {
  const cacheKey = getCacheKey(config);

  const cached = clientCache.get<BitbucketClient>(cacheKey);
  if (cached) {
    return cached;
  }

  const host = config?.host || getBitbucketHost();
  const token = config?.token || getBitbucketToken();
  const username = config?.username || getBitbucketUsername();

  if (!token) {
    throw new Error(
      'Bitbucket token not found. Set BITBUCKET_TOKEN or BB_TOKEN environment variable.'
    );
  }

  const authorization = username
    ? `Basic ${toBase64(`${username}:${token}`)}`
    : `Bearer ${token}`;

  const client = BitbucketCloud.createBitbucketCloudClient({
    baseUrl: host,
    headers: {
      Accept: 'application/json',
      Authorization: authorization,
    },
  });

  clientCache.set(cacheKey, client);
  return client;
}

export function clearBitbucketClients(): void {
  clientCache.flushAll();
}

export function clearBitbucketClient(config?: ClientConfig): void {
  const cacheKey = getCacheKey(config);
  clientCache.del(cacheKey);
}

const MAX_BRANCH_CACHE_SIZE = 200;
const defaultBranchCache = new Map<string, string>();

export function getCachedDefaultBranch(projectId: string): string | undefined {
  return defaultBranchCache.get(projectId);
}

export function cacheDefaultBranch(projectId: string, branch: string): void {
  if (defaultBranchCache.size >= MAX_BRANCH_CACHE_SIZE) {
    const oldest = defaultBranchCache.keys().next().value;
    if (oldest !== undefined) defaultBranchCache.delete(oldest);
  }
  defaultBranchCache.set(projectId, branch);
}

export function clearDefaultBranchCache(): void {
  defaultBranchCache.clear();
}

export function getAuthHeader(config?: ClientConfig): string {
  const token = config?.token || getBitbucketToken();
  const username = config?.username || getBitbucketUsername();

  if (!token) {
    throw new Error('Bitbucket token not found.');
  }

  return username
    ? `Basic ${toBase64(`${username}:${token}`)}`
    : `Bearer ${token}`;
}
