/**
 * Types for github_search_pull_requests tool (githubSearchPullRequests)
 * @module tools/github_search_pull_requests/types
 */

import type {
  GitHubPullRequestOutput,
  GitHubSearchPullRequestsData,
  GitHubSearchPullRequestsPagination,
  GitHubSearchPullRequestsToolResult,
} from '../../scheme/outputTypes.js';

/**
 * Query parameters for searching pull requests
 */
export interface GitHubPullRequestSearchQuery {
  id?: string;
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
  page?: number;
  withComments?: boolean;
  withCommits?: boolean;
  type?: 'metadata' | 'fullContent' | 'partialContent';
  partialContentMetadata?: {
    file: string;
    additions?: number[];
    deletions?: number[];
  }[];
  charOffset?: number;
  charLength?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/** Final user-facing pull request item derived from the output schema */
export type PullRequestInfo = GitHubPullRequestOutput;

/** Final user-facing success data derived from the output schema */
export type PullRequestSearchResultData = GitHubSearchPullRequestsData;

/** Final user-facing flattened query result derived from the output schema */
export type PullRequestSearchResult = GitHubSearchPullRequestsToolResult;

/** Pagination info for final user-facing pull request search results */
export type PRSearchPagination = GitHubSearchPullRequestsPagination;

/** Internal GitHub API pull request item before provider normalization */
export interface GitHubPullRequestApiItem {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  author: string;
  assignees?: string[];
  labels?: Array<{
    id: number;
    name: string;
    color: string;
    description?: string;
  }>;
  head_ref: string;
  head_sha?: string;
  base_ref: string;
  base_sha?: string;
  body?: string | null;
  comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  comment_details?: Array<{
    id: string;
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
    changes?: number;
    patch?: string;
  }>;
  commit_details?: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes?: number;
      patch?: string;
    }>;
  }>;
}

/** Internal GitHub API pull request search result data */
export interface GitHubPullRequestSearchApiData {
  owner?: string;
  repo?: string;
  pull_requests?: GitHubPullRequestApiItem[];
  total_count?: number;
  incomplete_results?: boolean;
  pagination?: PRSearchPagination;
  /** Character-based output pagination (when output exceeds size limit) */
  outputPagination?: {
    charOffset: number;
    charLength: number;
    totalChars: number;
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
  };
}

/** Internal GitHub API pull request search result */
export interface GitHubPullRequestSearchApiResult extends GitHubPullRequestSearchApiData {
  error?: string;
  hints?: string[];
}
