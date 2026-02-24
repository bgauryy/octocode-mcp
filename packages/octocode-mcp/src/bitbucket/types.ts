/**
 * Bitbucket API Types
 *
 * Types for Bitbucket Cloud REST API responses.
 *
 * @module bitbucket/types
 */

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface BitbucketAPIError {
  error: string;
  status: number;
  type: 'http' | 'network' | 'unknown';
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  retryAfter?: number;
  hints?: string[];
}

export type BitbucketAPIResponse<T> =
  | { data: T; status: number }
  | BitbucketAPIError;

// ============================================================================
// PAGINATED RESPONSE
// ============================================================================

export interface BitbucketPaginatedResponse<T> {
  values: T[];
  page?: number;
  pagelen?: number;
  size?: number;
  next?: string;
  previous?: string;
}

// ============================================================================
// SEARCH TYPES
// ============================================================================

export interface BitbucketCodeSearchSegment {
  text: string;
  match?: boolean;
}

export interface BitbucketCodeSearchLine {
  line: number;
  segments: BitbucketCodeSearchSegment[];
}

export interface BitbucketCodeSearchContentMatch {
  lines: BitbucketCodeSearchLine[];
}

export interface BitbucketCodeSearchItem {
  type: string;
  content_matches: BitbucketCodeSearchContentMatch[];
  path_matches?: BitbucketCodeSearchContentMatch[];
  file: {
    path: string;
    type: string;
    links?: {
      self?: { href: string };
    };
  };
}

export interface BitbucketCodeSearchResult {
  items: BitbucketCodeSearchItem[];
  totalCount: number;
  pagination: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    totalMatches?: number;
  };
}

// ============================================================================
// REPOSITORY TYPES
// ============================================================================

export interface BitbucketRepository {
  uuid: string;
  name: string;
  full_name: string;
  slug: string;
  description: string;
  is_private: boolean;
  language: string;
  mainbranch?: { name: string; type: string };
  updated_on: string;
  created_on: string;
  size?: number;
  forks_count?: number;
  has_issues?: boolean;
  has_wiki?: boolean;
  links?: {
    html?: { href: string };
    clone?: Array<{ href: string; name: string }>;
  };
  project?: { key: string; name: string };
  owner?: { display_name: string; username?: string; uuid: string };
}

// ============================================================================
// FILE CONTENT TYPES
// ============================================================================

export interface BitbucketFileContentQuery {
  workspace: string;
  repoSlug: string;
  commit: string;
  path: string;
}

export interface BitbucketFileContentResult {
  content: string;
  path: string;
  size: number;
  ref: string;
  encoding: 'utf-8';
  lastCommitSha?: string;
}

// ============================================================================
// TREE/STRUCTURE TYPES
// ============================================================================

export interface BitbucketTreeEntry {
  type: 'commit_file' | 'commit_directory';
  path: string;
  size?: number;
  commit?: { hash: string };
  links?: {
    self?: { href: string };
  };
}

// ============================================================================
// PULL REQUEST TYPES
// ============================================================================

export interface BitbucketPullRequest {
  id: number;
  title: string;
  description: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  author: {
    display_name: string;
    username?: string;
    uuid: string;
  };
  source: {
    branch: { name: string };
    commit?: { hash: string };
    repository?: { full_name: string };
  };
  destination: {
    branch: { name: string };
    commit?: { hash: string };
    repository?: { full_name: string };
  };
  close_source_branch?: boolean;
  created_on: string;
  updated_on: string;
  comment_count?: number;
  task_count?: number;
  merge_commit?: { hash: string };
  closed_by?: { display_name: string };
  links?: {
    html?: { href: string };
    diff?: { href: string };
    diffstat?: { href: string };
    comments?: { href: string };
    commits?: { href: string };
  };
  reviewers?: Array<{
    display_name: string;
    username?: string;
    uuid: string;
  }>;
}

export interface BitbucketPRComment {
  id: number;
  content: { raw: string; markup?: string; html?: string };
  user: { display_name: string; username?: string };
  created_on: string;
  updated_on: string;
  inline?: { from?: number; to?: number; path: string };
}

export interface BitbucketDiffstatEntry {
  type: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  old?: { path: string };
  new?: { path: string };
  lines_added: number;
  lines_removed: number;
}
