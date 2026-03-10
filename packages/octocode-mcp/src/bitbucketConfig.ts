/**
 * Bitbucket configuration module.
 * Handles Bitbucket token resolution and host configuration.
 */
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

function resolveBitbucketConfig(): BitbucketConfig {
  const tokenResult = resolveBitbucketToken();

  return {
    host: process.env.BITBUCKET_HOST?.trim() || 'https://api.bitbucket.org/2.0',
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

export function getBitbucketHost(): string {
  return process.env.BITBUCKET_HOST?.trim() || 'https://api.bitbucket.org/2.0';
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
