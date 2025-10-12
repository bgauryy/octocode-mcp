/** Central type definitions for Octocode-MCP */

import type { GitHubAPIError } from './github/githubAPI.js';
import type { QueryStatus } from './utils/bulkOperations.js';

// ============================================================================
// CORE TOOL TYPES
// ============================================================================

export interface ToolResult extends Record<string, unknown> {
  status: QueryStatus;
  researchGoal?: string;
  reasoning?: string;
  hints?: string[];
}

export interface ToolErrorResult extends ToolResult {
  status: 'error';
  error: string | GitHubAPIError;
}

export interface ToolSuccessResult<T = Record<string, unknown>>
  extends ToolResult {
  status: 'hasResults' | 'empty';
  data?: T;
}

export interface HintContext {
  resultType: 'hasResults' | 'empty' | 'failed';
  apiError?: GitHubAPIError;
}

export interface OrganizedHints {
  hasResults?: string[];
  empty?: string[];
  failed?: string[];
}

// ============================================================================
// GITHUB CODE SEARCH TYPES
// ============================================================================

export interface GitHubCodeSearchQuery extends Record<string, unknown> {
  keywordsToSearch: string[];
  owner?: string;
  repo?: string;
  extension?: string;
  stars?: string;
  filename?: string;
  path?: string;
  match?: 'file' | 'path';
  limit?: number;
  minify?: boolean;
  sanitize?: boolean;
  researchGoal?: string;
  reasoning?: string;
}

export interface SearchFile {
  path: string;
  text_matches: string[];
}

export interface SearchResult {
  researchGoal?: string;
  reasoning?: string;
  owner?: string;
  repo?: string;
  files: SearchFile[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>;
}

// ============================================================================
// GITHUB FILE CONTENT TYPES
// ============================================================================

export interface FileContentQuery extends Record<string, unknown> {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  fullContent?: boolean;
  startLine?: number;
  endLine?: number;
  matchString?: string;
  matchStringContextLines?: number;
  minified?: boolean;
  sanitize?: boolean;
  researchGoal?: string;
  reasoning?: string;
}

export interface ContentResult {
  researchGoal?: string;
  reasoning?: string;
  owner?: string;
  repo?: string;
  path?: string;
  contentLength?: number;
  content?: string;
  branch?: string;
  startLine?: number;
  endLine?: number;
  isPartial?: boolean;
  minified?: boolean;
  minificationFailed?: boolean;
  minificationType?: string;
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>;
  originalQuery?: Record<string, unknown>;
  securityWarnings?: string[];
  sampling?: Record<string, unknown>;
}

// ============================================================================
// GITHUB REPOSITORY SEARCH TYPES
// ============================================================================

export interface GitHubReposSearchQuery extends Record<string, unknown> {
  keywordsToSearch?: string[];
  topicsToSearch?: string[];
  owner?: string;
  stars?: string;
  size?: string;
  created?: string;
  updated?: string;
  match?: Array<'name' | 'description' | 'readme'>;
  sort?: 'forks' | 'stars' | 'updated' | 'best-match';
  limit?: number;
  researchGoal?: string;
  reasoning?: string;
}

export interface SimplifiedRepository {
  owner: string;
  repo: string;
  stars: number;
  description: string;
  url: string;
  updatedAt: string;
}

export interface RepoSearchResult {
  researchGoal?: string;
  reasoning?: string;
  repositories: SimplifiedRepository[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>;
}

// ============================================================================
// GITHUB REPOSITORY STRUCTURE TYPES
// ============================================================================

export interface GitHubViewRepoStructureQuery extends Record<string, unknown> {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  depth?: number;
  researchGoal?: string;
  reasoning?: string;
}

export interface RepoStructureResult {
  researchGoal?: string;
  reasoning?: string;
  owner?: string;
  repo?: string;
  path?: string;
  files?: string[];
  folders?: string[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>;
}

// ============================================================================
// GITHUB PULL REQUEST TYPES
// ============================================================================

export interface GitHubPullRequestSearchQuery extends Record<string, unknown> {
  query?: string;
  owner?: string;
  repo?: string;
  prNumber?: number;
  state?: 'open' | 'closed';
  assignee?: string;
  author?: string;
  commenter?: string;
  involves?: string;
  mentions?: string;
  'review-requested'?: string;
  'reviewed-by'?: string;
  label?: string | string[];
  'no-label'?: boolean;
  'no-milestone'?: boolean;
  'no-project'?: boolean;
  'no-assignee'?: boolean;
  head?: string;
  base?: string;
  created?: string;
  updated?: string;
  closed?: string;
  'merged-at'?: string;
  comments?: number | string;
  reactions?: number | string;
  interactions?: number | string;
  merged?: boolean;
  draft?: boolean;
  match?: Array<'title' | 'body' | 'comments'>;
  sort?: 'created' | 'updated' | 'best-match';
  order?: 'asc' | 'desc';
  limit?: number;
  withComments?: boolean;
  withContent?: boolean;
  researchGoal?: string;
  reasoning?: string;
}

export interface PullRequestInfo {
  id: number;
  number: number;
  title: string;
  url: string;
  html_url: string;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  author: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  };
  assignees?: Array<{
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  }>;
  labels?: Array<{
    id: number;
    name: string;
    color: string;
    description?: string;
  }>;
  milestone?: {
    id: number;
    title: string;
    description?: string;
    state: 'open' | 'closed';
    created_at: string;
    updated_at: string;
    due_on?: string;
  };
  head: {
    ref: string;
    sha: string;
    repo?: string;
  };
  base: {
    ref: string;
    sha: string;
    repo: string;
  };
  body?: string;
  comments?: number;
  review_comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  comment_details?: Array<{
    id: number;
    user: string;
    body: string;
    created_at: string;
    updated_at: string;
  }>;
  file_changes?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>;
}

export interface PullRequestSearchResult {
  researchGoal?: string;
  reasoning?: string;
  pull_requests?: PullRequestInfo[];
  total_count?: number;
  incomplete_results?: boolean;
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>;
}
