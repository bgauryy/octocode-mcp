/**
 * GitLab API Types
 *
 * Type definitions for GitLab API operations.
 *
 * @module gitlab/types
 */

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * GitLab API error structure.
 */
export interface GitLabAPIError {
  error: string;
  status?: number;
  type: 'http' | 'network' | 'unknown';
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  retryAfter?: number;
  hints?: string[];
}

/**
 * GitLab API success response.
 */
export interface GitLabAPISuccess<T> {
  data: T;
  status: number;
  headers?: Record<string, string>;
}

/**
 * GitLab API response (success or error).
 */
export type GitLabAPIResponse<T> = GitLabAPISuccess<T> | GitLabAPIError;

// ============================================================================
// PROJECT TYPES
// ============================================================================

/**
 * GitLab project/repository information.
 */
export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  description: string | null;
  visibility: 'public' | 'internal' | 'private';
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  default_branch: string;
  topics: string[];
  tag_list: string[]; // Deprecated, use topics
  star_count: number;
  forks_count: number;
  open_issues_count: number;
  web_url: string;
  http_url_to_repo: string;
  ssh_url_to_repo: string;
  readme_url: string | null;
  archived: boolean;
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: 'user' | 'group';
    full_path: string;
    web_url: string;
  };
  _links?: {
    self: string;
    issues: string;
    merge_requests: string;
    repo_branches: string;
  };
}

// ============================================================================
// CODE SEARCH TYPES
// ============================================================================

/**
 * GitLab code search query parameters.
 */
export interface GitLabCodeSearchQuery {
  /** Search string */
  search: string;
  /** Project ID (numeric or URL-encoded path) */
  projectId?: number | string;
  /** Group ID for group-scoped search (Premium) */
  groupId?: number | string;
  /** Search type: basic, advanced, or zoekt */
  searchType?: 'basic' | 'advanced' | 'zoekt';
  /** File path filter */
  path?: string;
  /** Filename filter */
  filename?: string;
  /** File extension filter */
  extension?: string;
  /** Branch/tag/commit reference */
  ref?: string;
  /** Results per page (max 100) */
  perPage?: number;
  /** Page number */
  page?: number;
}

/**
 * GitLab code search result item.
 */
export interface GitLabCodeSearchItem {
  basename: string;
  data: string;
  path: string;
  filename: string;
  id: string | null;
  ref: string;
  startline: number;
  project_id: number;
}

/**
 * GitLab code search result.
 */
export interface GitLabCodeSearchResult {
  items: GitLabCodeSearchItem[];
  totalCount?: number;
  pagination?: {
    currentPage: number;
    totalPages?: number;
    perPage: number;
    hasMore: boolean;
  };
}

// ============================================================================
// FILE CONTENT TYPES
// ============================================================================

/**
 * GitLab file content query parameters.
 */
export interface GitLabFileContentQuery {
  /** Project ID (numeric or URL-encoded path) */
  projectId: number | string;
  /** File path (URL-encoded) */
  path: string;
  /** Branch/tag/commit reference (REQUIRED for GitLab) */
  ref: string;
  /** Start line for partial content */
  startLine?: number;
  /** End line for partial content */
  endLine?: number;
}

/**
 * GitLab file content result.
 */
export interface GitLabFileContent {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
  execute_filemode: boolean;
}

// ============================================================================
// MERGE REQUEST TYPES
// ============================================================================

/**
 * GitLab merge request query parameters.
 */
export interface GitLabMergeRequestQuery {
  /** Project ID */
  projectId?: number | string;
  /** MR iid (project-scoped number, like GitHub PR number) */
  iid?: number;
  /** State filter */
  state?: 'opened' | 'closed' | 'merged' | 'all';
  /** Author username */
  authorUsername?: string;
  /** Assignee username */
  assigneeUsername?: string;
  /** Labels filter */
  labels?: string[];
  /** Source branch filter */
  sourceBranch?: string;
  /** Target branch filter */
  targetBranch?: string;
  /** Created after date */
  createdAfter?: string;
  /** Updated after date */
  updatedAfter?: string;
  /** Order by field */
  orderBy?: 'created_at' | 'updated_at';
  /** Sort order */
  sort?: 'asc' | 'desc';
  /** Results per page */
  perPage?: number;
  /** Page number */
  page?: number;
}

/**
 * GitLab merge request item.
 */
export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed' | 'merged';
  merged_by: { username: string } | null;
  merged_at: string | null;
  closed_by: { username: string } | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  target_branch: string;
  source_branch: string;
  user_notes_count: number;
  upvotes: number;
  downvotes: number;
  author: {
    id: number;
    username: string;
    name: string;
    avatar_url: string;
    web_url: string;
  };
  assignees: Array<{
    id: number;
    username: string;
    name: string;
  }>;
  assignee: {
    id: number;
    username: string;
    name: string;
  } | null;
  source_project_id: number;
  target_project_id: number;
  labels: string[];
  draft: boolean;
  work_in_progress: boolean;
  milestone: {
    id: number;
    iid: number;
    title: string;
    state: string;
  } | null;
  merge_when_pipeline_succeeds: boolean;
  merge_status: string;
  sha: string;
  merge_commit_sha: string | null;
  squash_commit_sha: string | null;
  web_url: string;
  diff_refs?: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
  changes_count?: string;
  has_conflicts?: boolean;
  blocking_discussions_resolved?: boolean;
  references?: {
    short: string;
    relative: string;
    full: string;
  };
}

/**
 * GitLab MR note/comment.
 */
export interface GitLabMRNote {
  id: number;
  body: string;
  author: {
    id: number;
    username: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
  system: boolean;
  noteable_id: number;
  noteable_type: string;
  noteable_iid: number;
  resolvable: boolean;
  resolved?: boolean;
}

// ============================================================================
// REPOSITORY TREE TYPES
// ============================================================================

/**
 * GitLab repository tree query parameters.
 */
export interface GitLabTreeQuery {
  /** Project ID */
  projectId: number | string;
  /** Branch/tag/commit reference */
  ref?: string;
  /** Subdirectory path */
  path?: string;
  /** Fetch recursively */
  recursive?: boolean;
  /** Results per page */
  perPage?: number;
  /** Page number */
  page?: number;
  /** Pagination type */
  pagination?: 'offset' | 'keyset' | 'none';
}

/**
 * GitLab tree item.
 */
export interface GitLabTreeItem {
  id: string;
  name: string;
  type: 'blob' | 'tree' | 'commit';
  path: string;
  mode: string;
}

// ============================================================================
// PROJECTS SEARCH TYPES
// ============================================================================

/**
 * GitLab projects search query parameters.
 */
export interface GitLabProjectsSearchQuery {
  /** Search string (name, description, path) */
  search?: string;
  /** Topic filter (single only - GitLab limitation) */
  topic?: string;
  /** Only owned projects */
  owned?: boolean;
  /** Only starred projects */
  starred?: boolean;
  /** Only member projects */
  membership?: boolean;
  /** Visibility filter */
  visibility?: 'public' | 'internal' | 'private';
  /** Archived filter */
  archived?: boolean;
  /** Order by field */
  orderBy?:
    | 'id'
    | 'name'
    | 'path'
    | 'created_at'
    | 'updated_at'
    | 'last_activity_at'
    | 'similarity'
    | 'star_count';
  /** Sort order */
  sort?: 'asc' | 'desc';
  /** Results per page */
  perPage?: number;
  /** Page number */
  page?: number;

  // Client-side filters (not supported by API)
  minStars?: number;
  maxStars?: number;
  createdAfter?: string;
  createdBefore?: string;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if response is a GitLab API error.
 */
export function isGitLabAPIError(obj: unknown): obj is GitLabAPIError {
  return !!(
    obj &&
    typeof obj === 'object' &&
    'error' in obj &&
    typeof (obj as Record<string, unknown>).error === 'string' &&
    'type' in obj
  );
}

/**
 * Check if response is a GitLab API success.
 */
export function isGitLabAPISuccess<T>(
  obj: unknown
): obj is GitLabAPISuccess<T> {
  return !!(
    obj &&
    typeof obj === 'object' &&
    'data' in obj &&
    'status' in obj &&
    typeof (obj as Record<string, unknown>).status === 'number'
  );
}
