/**
 * Provider Execution Layer
 *
 * This module provides high-level execution functions that route requests
 * to the appropriate provider based on the `provider` parameter in queries.
 * Tools should use these functions instead of calling providers directly.
 *
 * @module providers/execute
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  getProvider,
  extractProviderFromQuery,
  DEFAULT_PROVIDER,
} from './factory.js';
import type {
  ProviderType,
  ProviderResponse,
  ExecutionOptions,
  CodeSearchQuery,
  CodeSearchResult,
  FileContentQuery,
  FileContentResult,
  RepoSearchQuery,
  RepoSearchResult,
  PullRequestQuery,
  PullRequestSearchResult,
  RepoStructureQuery,
  RepoStructureResult,
} from './types.js';

// ============================================================================
// EXECUTION FUNCTIONS
// ============================================================================

/**
 * Execute a code search with the appropriate provider.
 *
 * Routes to GitHub or GitLab based on `query.provider` (default: 'github').
 *
 * @param query - Code search query with unified parameters
 * @param options - Execution options (auth, session, etc.)
 * @returns Provider response with code search results
 *
 * @example
 * ```typescript
 * // Search GitHub (default)
 * const githubResult = await executeCodeSearch({
 *   keywords: ['useState', 'useEffect'],
 *   projectId: 'facebook/react',
 * });
 *
 * // Search GitLab
 * const gitlabResult = await executeCodeSearch({
 *   provider: 'gitlab',
 *   keywords: ['pipeline'],
 *   projectId: 'gitlab-org/gitlab',
 * });
 * ```
 */
export async function executeCodeSearch(
  query: CodeSearchQuery,
  options?: ExecutionOptions
): Promise<ProviderResponse<CodeSearchResult>> {
  const providerType = extractProviderFromQuery(query);
  const provider = getProvider(providerType, {
    type: providerType,
    token: options?.token,
    authInfo: options?.authInfo,
    baseUrl: options?.baseUrl,
  });

  return provider.searchCode(query);
}

/**
 * Execute a file content fetch with the appropriate provider.
 *
 * @param query - File content query with unified parameters
 * @param options - Execution options
 * @returns Provider response with file content
 *
 * @example
 * ```typescript
 * const result = await executeGetFileContent({
 *   projectId: 'facebook/react',
 *   path: 'packages/react/src/React.js',
 *   ref: 'main',
 * });
 * ```
 */
export async function executeGetFileContent(
  query: FileContentQuery,
  options?: ExecutionOptions
): Promise<ProviderResponse<FileContentResult>> {
  const providerType = extractProviderFromQuery(query);
  const provider = getProvider(providerType, {
    type: providerType,
    token: options?.token,
    authInfo: options?.authInfo,
    baseUrl: options?.baseUrl,
  });

  return provider.getFileContent(query);
}

/**
 * Execute a repository search with the appropriate provider.
 *
 * @param query - Repository search query with unified parameters
 * @param options - Execution options
 * @returns Provider response with repository search results
 *
 * @example
 * ```typescript
 * const result = await executeRepoSearch({
 *   keywords: ['react', 'hooks'],
 *   topics: ['typescript'],
 *   minStars: 100,
 * });
 * ```
 */
export async function executeRepoSearch(
  query: RepoSearchQuery,
  options?: ExecutionOptions
): Promise<ProviderResponse<RepoSearchResult>> {
  const providerType = extractProviderFromQuery(query);
  const provider = getProvider(providerType, {
    type: providerType,
    token: options?.token,
    authInfo: options?.authInfo,
    baseUrl: options?.baseUrl,
  });

  return provider.searchRepos(query);
}

/**
 * Execute a pull/merge request search with the appropriate provider.
 *
 * @param query - Pull request query with unified parameters
 * @param options - Execution options
 * @returns Provider response with PR/MR search results
 *
 * @example
 * ```typescript
 * // Get specific PR
 * const pr = await executePullRequestSearch({
 *   projectId: 'facebook/react',
 *   number: 12345,
 *   withComments: true,
 * });
 *
 * // Search PRs
 * const results = await executePullRequestSearch({
 *   projectId: 'facebook/react',
 *   state: 'open',
 *   author: 'gaearon',
 * });
 * ```
 */
export async function executePullRequestSearch(
  query: PullRequestQuery,
  options?: ExecutionOptions
): Promise<ProviderResponse<PullRequestSearchResult>> {
  const providerType = extractProviderFromQuery(query);
  const provider = getProvider(providerType, {
    type: providerType,
    token: options?.token,
    authInfo: options?.authInfo,
    baseUrl: options?.baseUrl,
  });

  return provider.searchPullRequests(query);
}

/**
 * Execute a repository structure fetch with the appropriate provider.
 *
 * @param query - Repository structure query with unified parameters
 * @param options - Execution options
 * @returns Provider response with repository structure
 *
 * @example
 * ```typescript
 * const structure = await executeGetRepoStructure({
 *   projectId: 'facebook/react',
 *   ref: 'main',
 *   path: 'packages',
 *   depth: 2,
 * });
 * ```
 */
export async function executeGetRepoStructure(
  query: RepoStructureQuery,
  options?: ExecutionOptions
): Promise<ProviderResponse<RepoStructureResult>> {
  const providerType = extractProviderFromQuery(query);
  const provider = getProvider(providerType, {
    type: providerType,
    token: options?.token,
    authInfo: options?.authInfo,
    baseUrl: options?.baseUrl,
  });

  return provider.getRepoStructure(query);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create execution options from common parameters.
 *
 * @param authInfo - MCP auth info
 * @param sessionId - Session ID for caching
 * @param token - Optional token override
 * @param baseUrl - Optional base URL override
 * @returns ExecutionOptions object
 */
export function createExecutionOptions(
  authInfo?: AuthInfo,
  sessionId?: string,
  token?: string,
  baseUrl?: string
): ExecutionOptions {
  return {
    authInfo,
    sessionId,
    token,
    baseUrl,
  };
}

/**
 * Validate that a provider type is valid.
 *
 * @param provider - Provider type to validate
 * @returns True if valid, false otherwise
 */
export function isValidProvider(provider: unknown): provider is ProviderType {
  return provider === 'github' || provider === 'gitlab';
}

/**
 * Get default provider type.
 */
export function getDefaultProvider(): ProviderType {
  return DEFAULT_PROVIDER;
}

// ============================================================================
// BACKWARD COMPATIBILITY HELPERS
// ============================================================================

/**
 * Convert legacy GitHub query parameters to unified format.
 *
 * This helper assists in migrating existing tool implementations that use
 * `owner` and `repo` separately to the unified `projectId` format.
 *
 * @param params - Object with owner and repo fields
 * @returns Object with projectId field
 *
 * @example
 * ```typescript
 * // Old format
 * const oldQuery = { owner: 'facebook', repo: 'react' };
 *
 * // Convert to unified
 * const unifiedQuery = {
 *   ...legacyToUnified(oldQuery),
 *   keywords: ['useState'],
 * };
 * ```
 */
export function legacyToUnified(params: { owner?: string; repo?: string }): {
  projectId?: string;
} {
  if (params.owner && params.repo) {
    return { projectId: `${params.owner}/${params.repo}` };
  }
  if (params.owner) {
    return { projectId: params.owner };
  }
  return {};
}

/**
 * Convert unified projectId to legacy owner/repo format.
 *
 * @param projectId - Unified project identifier
 * @returns Object with owner and repo fields
 */
export function unifiedToLegacy(projectId?: string): {
  owner?: string;
  repo?: string;
} {
  if (!projectId) {
    return {};
  }

  const parts = projectId.split('/');
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1] };
  }

  // For single-part projectId (e.g., organization name)
  return { owner: projectId };
}
