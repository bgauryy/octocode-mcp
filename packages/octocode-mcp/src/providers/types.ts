/**
 * Provider Abstraction Layer - Type Definitions
 *
 * This module defines the interfaces for provider-agnostic code hosting operations.
 * Tools use these unified types, and the execution layer routes to the appropriate
 * provider (GitHub, GitLab, etc.) based on the `provider` parameter.
 *
 * @module providers/types
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

// Re-export query types
export type {
  BaseProviderQuery,
  CodeSearchQuery,
  FileContentQuery,
  RepoSearchQuery,
  PullRequestQuery,
  RepoStructureQuery,
} from './providerQueries.js';

// Re-export result types
export type {
  UnifiedRepository,
  CodeSearchItem,
  CodeSearchResult,
  FileContentResult,
  RepoSearchResult,
  PullRequestItem,
  PullRequestSearchResult,
  DirectoryEntry,
  RepoStructureResult,
} from './providerResults.js';

import type {
  CodeSearchQuery,
  FileContentQuery,
  RepoSearchQuery,
  PullRequestQuery,
  RepoStructureQuery,
} from './providerQueries.js';
import type {
  CodeSearchResult,
  FileContentResult,
  RepoSearchResult,
  PullRequestSearchResult,
  RepoStructureResult,
} from './providerResults.js';

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

/**
 * Supported code hosting providers.
 * Default is 'github' .
 */
export type ProviderType = 'github' | 'gitlab';

/**
 * Configuration for provider initialization.
 */
export interface ProviderConfig {
  /** Provider type */
  type: ProviderType;
  /** Base URL for self-hosted instances (e.g., 'https://gitlab.mycompany.com') */
  baseUrl?: string;
  /** Provider-specific authentication token */
  token?: string;
  /** MCP auth info (contains OAuth token for GitHub) */
  authInfo?: AuthInfo;
}

// ============================================================================
// PROVIDER RESPONSE TYPE
// ============================================================================

/**
 * Standardized response from provider operations.
 */
export interface ProviderResponse<T> {
  /** Response data (on success) */
  data?: T;
  /** Error message (on failure) */
  error?: string;
  /** HTTP status code */
  status: number;
  /** Provider that handled the request */
  provider: ProviderType;
  /** Additional hints for the user */
  hints?: string[];
  /** Rate limit info */
  rateLimit?: {
    remaining: number;
    reset: number;
    retryAfter?: number;
  };
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * Interface that all code hosting providers must implement.
 */
export interface ICodeHostProvider {
  /** Provider type identifier */
  readonly type: ProviderType;

  searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>>;

  getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>>;

  searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>>;

  searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>>;

  getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>>;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

/**
 * Options for provider execution.
 */
export interface ExecutionOptions {
  /** Session ID for caching */
  sessionId?: string;
  /** MCP auth info */
  authInfo?: AuthInfo;
  /** Provider-specific token override */
  token?: string;
  /** Base URL override for self-hosted instances */
  baseUrl?: string;
}

/**
 * Union type for all query types.
 */
export type ProviderQuery =
  | CodeSearchQuery
  | FileContentQuery
  | RepoSearchQuery
  | PullRequestQuery
  | RepoStructureQuery;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a response is successful.
 */
export function isProviderSuccess<T>(
  response: ProviderResponse<T>
): response is ProviderResponse<T> & { data: T } {
  return response.data !== undefined && !response.error;
}

/**
 * Check if a response is an error.
 */
export function isProviderError<T>(
  response: ProviderResponse<T>
): response is ProviderResponse<T> & { error: string } {
  return response.error !== undefined;
}
