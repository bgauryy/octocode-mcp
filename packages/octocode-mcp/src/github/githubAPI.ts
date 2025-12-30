import type { components } from '@octokit/openapi-types';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// ============================================================================
// OCTOKIT SCHEMA TYPE ALIASES
// These types are derived directly from Octokit's OpenAPI-generated schemas.
// Reference: https://github.com/octokit/openapi-types.ts
// Schema source: https://github.com/github/rest-api-description
// ============================================================================

// ─── Repository Types ───────────────────────────────────────────────────────
/** Full repository details. Schema: components['schemas']['full-repository'] */
export type Repository = components['schemas']['full-repository'];

// ─── Content Types ──────────────────────────────────────────────────────────
/**
 * Content directory entry (single item from directory listing).
 * Schema: components['schemas']['content-directory'][number]
 *
 * Note: The 'content-directory' schema is an array type, so we index into it
 * to get the type of a single entry.
 */
export type ContentDirectoryEntry =
  components['schemas']['content-directory'][number];

// ─── Search Result Types ────────────────────────────────────────────────────
/** Code search result item. Schema: components['schemas']['code-search-result-item'] */
export type CodeSearchResultItem =
  components['schemas']['code-search-result-item'];

/** Repository search result item. Schema: components['schemas']['repo-search-result-item'] */
export type RepoSearchResultItem =
  components['schemas']['repo-search-result-item'];

/** Issue/PR search result item. Schema: components['schemas']['issue-search-result-item'] */
export type IssueSearchResultItem =
  components['schemas']['issue-search-result-item'];

// ─── Pull Request Types ─────────────────────────────────────────────────────
/** Diff entry for file changes. Schema: components['schemas']['diff-entry'] */
export type DiffEntry = components['schemas']['diff-entry'];

/** Full pull request details. Schema: components['schemas']['pull-request'] */
export type PullRequestItem = components['schemas']['pull-request'];

/** Simplified pull request. Schema: components['schemas']['pull-request-simple'] */
export type PullRequestSimple = components['schemas']['pull-request-simple'];

// ─── Comment Types ──────────────────────────────────────────────────────────
/** Issue comment. Schema: components['schemas']['issue-comment'] */
export type IssueComment = components['schemas']['issue-comment'];

// ─── Rate Limit Types ───────────────────────────────────────────────────────
/**
 * Rate limit resource info (core, search, graphql, etc.)
 * Schema: components['schemas']['rate-limit']
 */
export type OctokitRateLimit = components['schemas']['rate-limit'];

/**
 * Full rate limit overview response.
 * Schema: components['schemas']['rate-limit-overview']
 */
export type OctokitRateLimitOverview =
  components['schemas']['rate-limit-overview'];

// ─── User Types ─────────────────────────────────────────────────────────────
/**
 * Simple user representation (minimal fields).
 * Schema: components['schemas']['simple-user']
 */
export type OctokitSimpleUser = components['schemas']['simple-user'];

/**
 * Public user profile with full details.
 * Schema: components['schemas']['public-user']
 */
export type OctokitPublicUser = components['schemas']['public-user'];

/**
 * Private user profile (authenticated user).
 * Schema: components['schemas']['private-user']
 */
export type OctokitPrivateUser = components['schemas']['private-user'];

// ─── Commit Types ───────────────────────────────────────────────────────────
/**
 * Commit details. Schema: components['schemas']['commit']
 */
export type OctokitCommit = components['schemas']['commit'];

/** Commit file change information (merged from CommitFileItem) */
export interface CommitFileInfo {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes?: number;
  patch?: string;
}

/** Commit information with file changes */
export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  files: CommitFileInfo[];
}

export type GetContentParameters =
  RestEndpointMethodTypes['repos']['getContent']['parameters'];
export type GetRepoResponse =
  RestEndpointMethodTypes['repos']['get']['response'];
export type SearchCodeParameters =
  RestEndpointMethodTypes['search']['code']['parameters'];
export type SearchCodeResponse =
  RestEndpointMethodTypes['search']['code']['response'];
export type SearchReposParameters =
  RestEndpointMethodTypes['search']['repos']['parameters'];

// Pull Request REST endpoint types
export type PullsListResponse =
  RestEndpointMethodTypes['pulls']['list']['response'];
export type PullsGetResponse =
  RestEndpointMethodTypes['pulls']['get']['response'];
export type IssuesListCommentsResponse =
  RestEndpointMethodTypes['issues']['listComments']['response'];

export interface GitHubAPIError {
  error: string;
  status?: number;
  type: 'http' | 'graphql' | 'network' | 'unknown';
  scopesSuggestion?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  retryAfter?: number;
  hints?: string[];
}

export interface GitHubAPISuccess<T> {
  data: T;
  status: number;
  headers?: Record<string, string>;
}

export type GitHubAPIResponse<T> = GitHubAPISuccess<T> | GitHubAPIError;

/**
 * Optimized code search result with enhanced match information.
 *
 * Derives from CodeSearchResultItem (components['schemas']['code-search-result-item'])
 * but with optimized structure for our search operations.
 */
export type OptimizedCodeSearchResult = {
  items: Array<
    Pick<CodeSearchResultItem, 'path' | 'url'> & {
      matches: Array<{
        context: string;
        positions: [number, number][];
      }>;
      repository: {
        nameWithOwner: string;
        url: string;
        pushedAt?: string;
      };
      minificationType?: string;
      lastModifiedAt?: string;
    }
  >;
  total_count: number;
  repository?: {
    name: string;
    url: string;
    createdAt?: string;
    updatedAt?: string;
    pushedAt?: string;
  };
  securityWarnings?: string[];
  minified?: boolean;
  minificationFailed?: boolean;
  minificationTypes?: string[];
  _researchContext?: {
    foundFiles: string[];
    repositoryContext?: {
      owner: string;
      repo: string;
      branch?: string;
    };
  };
  pagination?: {
    currentPage: number;
    totalPages: number;
    perPage: number;
    totalMatches: number;
    hasMore: boolean;
  };
};

/**
 * Custom pull request item for search results.
 *
 * This type picks common fields from IssueSearchResultItem (which GitHub uses for
 * both issues and PRs in search results) and extends with PR-specific fields.
 *
 * Related Octokit types:
 * - IssueSearchResultItem: components['schemas']['issue-search-result-item']
 * - PullRequestItem: components['schemas']['pull-request'] (full PR details)
 * - DiffEntry: components['schemas']['diff-entry'] (file changes)
 */
/**
 * Comment structure from GitHub REST API (issues.listComments).
 * Note: This uses snake_case to match REST API conventions.
 */
export interface PRCommentItem {
  id: string;
  user: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export type GitHubPullRequestItem = Pick<
  IssueSearchResultItem,
  | 'number'
  | 'title'
  | 'body'
  | 'state'
  | 'created_at'
  | 'updated_at'
  | 'closed_at'
  | 'url'
  | 'draft'
> & {
  author: string;
  labels: string[];
  merged_at?: string;
  comments?: PRCommentItem[];
  reactions: number;
  head?: string;
  base?: string;
  head_sha?: string;
  base_sha?: string;
  file_changes?: {
    total_count: number;
    files: DiffEntry[];
  };
  commits?: CommitInfo[];
  _sanitization_warnings?: string[];
};

export interface GitHubPullRequestsSearchParams {
  query?: string;
  owner?: string | string[];
  repo?: string | string[];
  prNumber?: number;
  state?: 'open' | 'closed';
  draft?: boolean;
  merged?: boolean;
  author?: string;
  assignee?: string;
  mentions?: string;
  commenter?: string;
  involves?: string;
  'reviewed-by'?: string;
  'review-requested'?: string;
  head?: string;
  base?: string;
  created?: string;
  updated?: string;
  'merged-at'?: string;
  closed?: string;
  comments?: number | string;
  reactions?: number | string;
  interactions?: number | string;
  label?: string | string[];
  'no-assignee'?: boolean;
  'no-label'?: boolean;
  'no-milestone'?: boolean;
  'no-project'?: boolean;
  match?: ('title' | 'body' | 'comments')[];
  sort?: 'created' | 'updated' | 'best-match';
  order?: 'asc' | 'desc';
  limit?: number;
  withComments?: boolean;
  withCommits?: boolean;
  type?: 'metadata' | 'fullContent' | 'partialContent';
  partialContentMetadata?: {
    file: string;
    additions?: number[];
    deletions?: number[];
  }[];
  exhaustive?: boolean;
  maxPages?: number;
  pageSize?: number;
  page?: number;
}

export function isGitHubAPIError(obj: unknown): obj is GitHubAPIError {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'error' in obj &&
    typeof (obj as Record<string, unknown>).error === 'string' &&
    'type' in obj
  );
}

export function isGitHubAPISuccess<T>(
  obj: unknown
): obj is GitHubAPISuccess<T> {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'data' in obj &&
    'status' in obj &&
    typeof (obj as Record<string, unknown>).status === 'number'
  );
}

export function isRepository(obj: unknown): obj is Repository {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as Record<string, unknown>).id === 'number' &&
    'name' in obj &&
    typeof (obj as Record<string, unknown>).name === 'string' &&
    'full_name' in obj &&
    typeof (obj as Record<string, unknown>).full_name === 'string' &&
    'private' in obj &&
    typeof (obj as Record<string, unknown>).private === 'boolean'
  );
}
