/**
 * Bitbucket configuration module.
 * Handles Bitbucket token resolution and host configuration.
 */
import { getConfigSync } from 'octocode-shared';
import type { BitbucketConfig, BitbucketTokenSourceType } from './types.js';

interface BitbucketTokenResolutionResult {
  token: string | null;
  source: BitbucketTokenSourceType;
}

/**
 * Resolve Bitbucket token from environment variables.
 * Priority: BITBUCKET_TOKEN > BB_TOKEN
 */
function resolveBitbucketToken(): BitbucketTokenResolutionResult {
  const bbToken = process.env.BITBUCKET_TOKEN?.trim();
  if (bbToken) {
    return { token: bbToken, source: 'env:BITBUCKET_TOKEN' };
  }

  const fallback = process.env.BB_TOKEN?.trim();
  if (fallback) {
    return { token: fallback, source: 'env:BB_TOKEN' };
  }

  return { token: null, source: 'none' };
}

/**
 * Resolve Bitbucket configuration from environment variables and global config.
 * Priority: env vars > ~/.octocode/.octocoderc > hardcoded defaults
 */
function resolveBitbucketConfig(): BitbucketConfig {
  const tokenResult = resolveBitbucketToken();

  return {
    host: getConfigSync().bitbucket.host,
    token: tokenResult.token,
    username: process.env.BITBUCKET_USERNAME?.trim() || null,
    tokenSource: tokenResult.source,
    isConfigured: tokenResult.token !== null,
  };
}

export function getBitbucketConfig(): BitbucketConfig {
  return resolveBitbucketConfig();
}

export function getBitbucketToken(): string | null {
  return resolveBitbucketToken().token;
}

/**
 * Get the Bitbucket host URL.
 * Priority: env var > config file > default
 */
export function getBitbucketHost(): string {
  return getConfigSync().bitbucket.host;
}

export function getBitbucketUsername(): string | null {
  return process.env.BITBUCKET_USERNAME?.trim() || null;
}

export function getBitbucketTokenSource(): BitbucketTokenSourceType {
  return resolveBitbucketToken().source;
}

export function isBitbucketConfigured(): boolean {
  return resolveBitbucketToken().token !== null;
}
