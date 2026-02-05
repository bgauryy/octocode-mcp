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
import type { PaginationInfo } from '../types.js';

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
// UNIFIED QUERY TYPES (Provider-Agnostic)
// ============================================================================

/**
 * Base query interface with common fields across all providers.
 */
export interface BaseProviderQuery {
  /** Provider to use (default: 'github') */
  provider?: ProviderType;
  /** Research context fields */
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * Unified code search query parameters.
 */
export interface CodeSearchQuery extends BaseProviderQuery {
  /** Keywords to search for in code */
  keywords: string[];
  /**
   * Project identifier:
   * - GitHub: 'owner/repo'
   * - GitLab: numeric ID or 'group/project'
   */
  projectId?: string;
  /** Filter by file path pattern */
  path?: string;
  /** Filter by filename */
  filename?: string;
  /** Filter by file extension (without dot) */
  extension?: string;
  /** Branch, tag, or commit reference */
  ref?: string;
  /** Maximum results per page (max 100) */
  limit?: number;
  /** Page number for pagination */
  page?: number;
}

/**
 * Unified file content query parameters.
 */
export interface FileContentQuery extends BaseProviderQuery {
  /**
   * Project identifier:
   * - GitHub: 'owner/repo'
   * - GitLab: numeric ID or 'group/project'
   */
  projectId: string;
  /** File path within the repository */
  path: string;
  /** Branch, tag, or commit reference (required for GitLab) */
  ref?: string;
  /** Start line number for partial content */
  startLine?: number;
  /** End line number for partial content */
  endLine?: number;
  /** String to search for in file content */
  matchString?: string;
  /** Context lines around match */
  matchStringContextLines?: number;
  /** Character offset for byte-range fetching */
  charOffset?: number;
  /** Character length for byte-range fetching */
  charLength?: number;
  /** Whether to fetch full content */
  fullContent?: boolean;
}

/**
 * Unified repository search query parameters.
 */
export interface RepoSearchQuery extends BaseProviderQuery {
  /** Keywords to search for */
  keywords?: string[];
  /** Topics/tags to filter by */
  topics?: string[];
  /** Owner/organization filter */
  owner?: string;
  /** Minimum stars (GitHub only, GitLab: client-side filter) */
  minStars?: number;
  /** Visibility filter */
  visibility?: 'public' | 'private' | 'internal';
  /** Sort by field */
  sort?: 'stars' | 'forks' | 'updated' | 'created' | 'best-match';
  /** Sort order */
  order?: 'asc' | 'desc';
  /** Maximum results per page */
  limit?: number;
  /** Page number */
  page?: number;
}

/**
 * Unified pull/merge request search query parameters.
 */
export interface PullRequestQuery extends BaseProviderQuery {
  /**
   * Project identifier (optional for cross-repo search):
   * - GitHub: 'owner/repo'
   * - GitLab: numeric ID or 'group/project'
   */
  projectId?: string;
  /**
   * PR/MR number within the project:
   * - GitHub: PR number
   * - GitLab: MR iid (project-scoped)
   */
  number?: number;
  /** State filter */
  state?: 'open' | 'closed' | 'merged' | 'all';
  /** Author username */
  author?: string;
  /** Assignee username */
  assignee?: string;
  /** Label filter */
  labels?: string[];
  /** Base branch filter */
  baseBranch?: string;
  /** Head branch filter */
  headBranch?: string;
  /** Created date filter (ISO 8601 or range like '>2024-01-01') */
  created?: string;
  /** Updated date filter */
  updated?: string;
  /** Include PR comments */
  withComments?: boolean;
  /** Include commit details */
  withCommits?: boolean;
  /** Content type */
  type?: 'metadata' | 'fullContent' | 'partialContent';
  /** Sort field */
  sort?: 'created' | 'updated' | 'best-match';
  /** Sort order */
  order?: 'asc' | 'desc';
  /** Maximum results */
  limit?: number;
  /** Page number */
  page?: number;
}

/**
 * Unified repository structure query parameters.
 */
export interface RepoStructureQuery extends BaseProviderQuery {
  /**
   * Project identifier:
   * - GitHub: 'owner/repo'
   * - GitLab: numeric ID or 'group/project'
   */
  projectId: string;
  /** Branch, tag, or commit reference */
  ref?: string;
  /** Subdirectory path */
  path?: string;
  /** Maximum depth to traverse */
  depth?: number;
  /** Whether to fetch recursively */
  recursive?: boolean;
  /** Entries per page for pagination */
  entriesPerPage?: number;
  /** Page number for entries */
  entryPageNumber?: number;
}

// ============================================================================
// UNIFIED RESULT TYPES (Provider-Agnostic)
// ============================================================================

/**
 * Unified repository information.
 */
export interface UnifiedRepository {
  /** Unique identifier (provider-specific format) */
  id: string;
  /** Repository name */
  name: string;
  /** Full path (owner/repo or group/project) */
  fullPath: string;
  /** Description */
  description: string | null;
  /** Web URL */
  url: string;
  /** Clone URL (HTTPS) */
  cloneUrl: string;
  /** Default branch */
  defaultBranch: string;
  /** Star count */
  stars: number;
  /** Fork count */
  forks: number;
  /** Visibility */
  visibility: 'public' | 'private' | 'internal';
  /** Topics/tags */
  topics: string[];
  /** Created date */
  createdAt: string;
  /** Updated date */
  updatedAt: string;
  /** Last activity date */
  lastActivityAt: string;
  /** Open issues count */
  openIssuesCount?: number;
  /** Archived status */
  archived?: boolean;
}

/**
 * Unified code search result item.
 */
export interface CodeSearchItem {
  /** File path */
  path: string;
  /** Match context/content */
  matches: Array<{
    context: string;
    positions: [number, number][];
  }>;
  /** File URL */
  url: string;
  /** Repository info */
  repository: {
    id: string;
    name: string;
    url: string;
  };
  /** Last modified date */
  lastModifiedAt?: string;
}

/**
 * Unified code search result.
 */
export interface CodeSearchResult {
  /** Search result items */
  items: CodeSearchItem[];
  /** Total count */
  totalCount: number;
  /** Pagination info */
  pagination: PaginationInfo;
  /** Repository context (if single repo search) */
  repositoryContext?: {
    owner: string;
    repo: string;
    branch?: string;
  };
}

/**
 * Unified file content result.
 */
export interface FileContentResult {
  /** File path */
  path: string;
  /** File content */
  content: string;
  /** Content encoding */
  encoding: 'utf-8' | 'base64';
  /** File size in bytes */
  size: number;
  /** Branch/ref used */
  ref: string;
  /** Last modified date */
  lastModified?: string;
  /** Last modified by */
  lastModifiedBy?: string;
  /** Last commit SHA */
  lastCommitSha?: string;
  /** Pagination for partial content */
  pagination?: PaginationInfo;
  /** Whether content is partial */
  isPartial?: boolean;
  /** Start line (if partial) */
  startLine?: number;
  /** End line (if partial) */
  endLine?: number;
}

/**
 * Unified repository search result.
 */
export interface RepoSearchResult {
  /** Found repositories */
  repositories: UnifiedRepository[];
  /** Total count */
  totalCount: number;
  /** Pagination info */
  pagination: PaginationInfo;
}

/**
 * Unified pull/merge request item.
 */
export interface PullRequestItem {
  /** PR/MR number */
  number: number;
  /** Title */
  title: string;
  /** Description/body */
  body: string | null;
  /** Web URL */
  url: string;
  /** State */
  state: 'open' | 'closed' | 'merged';
  /** Draft status */
  draft: boolean;
  /** Author username */
  author: string;
  /** Assignees */
  assignees: string[];
  /** Labels */
  labels: string[];
  /** Source branch */
  sourceBranch: string;
  /** Target branch */
  targetBranch: string;
  /** Source SHA */
  sourceSha?: string;
  /** Target SHA */
  targetSha?: string;
  /** Created date */
  createdAt: string;
  /** Updated date */
  updatedAt: string;
  /** Closed date */
  closedAt?: string;
  /** Merged date */
  mergedAt?: string;
  /** Comment count */
  commentsCount?: number;
  /** Changed files count */
  changedFilesCount?: number;
  /** Additions count */
  additions?: number;
  /** Deletions count */
  deletions?: number;
  /** Comments (if requested) */
  comments?: Array<{
    id: string;
    author: string;
    body: string;
    createdAt: string;
    updatedAt: string;
  }>;
  /** File changes (if requested) */
  fileChanges?: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

/**
 * Unified pull/merge request search result.
 */
export interface PullRequestSearchResult {
  /** Found PRs/MRs */
  items: PullRequestItem[];
  /** Total count */
  totalCount: number;
  /** Pagination info */
  pagination: PaginationInfo;
  /** Repository context (if single repo) */
  repositoryContext?: {
    owner: string;
    repo: string;
  };
}

/**
 * Directory entry in repository structure.
 */
export interface DirectoryEntry {
  files: string[];
  folders: string[];
}

/**
 * Unified repository structure result.
 */
export interface RepoStructureResult {
  /** Project path */
  projectPath: string;
  /** Branch/ref */
  branch: string;
  /** Current path */
  path: string;
  /** Structure by directory */
  structure: Record<string, DirectoryEntry>;
  /** Summary */
  summary: {
    totalFiles: number;
    totalFolders: number;
    truncated: boolean;
  };
  /** Pagination info */
  pagination?: PaginationInfo;
  /** Hints for user */
  hints?: string[];
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
 *
 * Each method accepts a unified query type and returns a unified result type,
 * allowing tools to be completely provider-agnostic.
 */
export interface ICodeHostProvider {
  /** Provider type identifier */
  readonly type: ProviderType;

  /**
   * Search for code within repositories.
   */
  searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>>;

  /**
   * Get file content from a repository.
   */
  getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>>;

  /**
   * Search for repositories.
   */
  searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>>;

  /**
   * Search for pull/merge requests.
   */
  searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>>;

  /**
   * Get repository structure/tree.
   */
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
