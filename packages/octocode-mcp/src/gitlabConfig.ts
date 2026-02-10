/**
 * GitLab configuration module.
 * Handles GitLab token resolution and host configuration.
 */
import { getConfigSync } from 'octocode-shared';
import type { GitLabConfig, GitLabTokenSourceType } from './types.js';

/** Result of GitLab token resolution with source tracking */
interface GitLabTokenResolutionResult {
  token: string | null;
  source: GitLabTokenSourceType;
}

/**
 * Resolve GitLab token from environment variables.
 * Priority: GITLAB_TOKEN > GL_TOKEN
 */
function resolveGitLabToken(): GitLabTokenResolutionResult {
  const gitlabToken = process.env.GITLAB_TOKEN?.trim();
  if (gitlabToken) {
    return { token: gitlabToken, source: 'env:GITLAB_TOKEN' };
  }

  const glToken = process.env.GL_TOKEN?.trim();
  if (glToken) {
    return { token: glToken, source: 'env:GL_TOKEN' };
  }

  return { token: null, source: 'none' };
}

/**
 * Resolve GitLab configuration from environment variables and global config.
 * Priority: env vars > ~/.octocode/.octocoderc > hardcoded defaults
 */
function resolveGitLabConfig(): GitLabConfig {
  const tokenResult = resolveGitLabToken();

  return {
    host: getConfigSync().gitlab.host,
    token: tokenResult.token,
    tokenSource: tokenResult.source,
    isConfigured: tokenResult.token !== null,
  };
}

/**
 * Get the GitLab configuration.
 * Always resolves fresh - no caching.
 */
export function getGitLabConfig(): GitLabConfig {
  return resolveGitLabConfig();
}

/**
 * Get the GitLab API token.
 * Always resolves fresh - not cached.
 */
export function getGitLabToken(): string | null {
  return resolveGitLabToken().token;
}

/**
 * Get the GitLab host URL.
 * Priority: env var > config file > default
 */
export function getGitLabHost(): string {
  return getConfigSync().gitlab.host;
}

/**
 * Get the source of the current GitLab token.
 */
export function getGitLabTokenSource(): GitLabTokenSourceType {
  return resolveGitLabToken().source;
}

/**
 * Check if GitLab is configured with a valid token.
 */
export function isGitLabConfigured(): boolean {
  return resolveGitLabToken().token !== null;
}
