import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { SCHEME_DESCRIPTIONS_STRUCTURED } from './schemDescriptions';
import { ToolResponse } from '../responses.js';

export const PRMatchScopeSchema = z
  .array(z.enum(['title', 'body', 'comments']))
  .optional()
  .describe(
    SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.match
  );

export const DateRangeSchema = z.object({
  created: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.created
    ),
  updated: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.updated
    ),
});

export const GitHubPullRequestSearchQuerySchema = BaseQuerySchema.extend({
  query: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.search.query
    ),
  owner: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.scope.owner
    ),
  repo: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.scope.repo
    ),
  prNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.scope.prNumber
    ),
  state: z
    .enum(['open', 'closed'])
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.state
    ),
  assignee: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .assignee
    ),
  author: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.author
    ),
  commenter: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .commenter
    ),
  involves: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .involves
    ),
  mentions: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .mentions
    ),
  'review-requested': z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters[
        'review-requested'
      ]
    ),
  'reviewed-by': z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters[
        'reviewed-by'
      ]
    ),
  'team-mentions': z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters[
        'team-mentions'
      ]
    ),
  label: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.label
    ),
  'no-label': z
    .boolean()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters[
        'no-label'
      ]
    ),
  milestone: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .milestone
    ),
  'no-milestone': z
    .boolean()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters[
        'no-milestone'
      ]
    ),
  project: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.project
    ),
  'no-project': z
    .boolean()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters[
        'no-project'
      ]
    ),
  'no-assignee': z
    .boolean()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters[
        'no-assignee'
      ]
    ),
  head: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.head
    ),
  base: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.base
    ),
  created: DateRangeSchema.shape.created,
  updated: DateRangeSchema.shape.updated,
  closed: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.closed
    ),
  'merged-at': z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters[
        'merged-at'
      ]
    ),

  comments: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .comments
    ),
  reactions: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .reactions
    ),
  interactions: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .interactions
    ),

  merged: z
    .boolean()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.merged
    ),
  draft: z
    .boolean()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.draft
    ),
  locked: z
    .boolean()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.locked
    ),

  // archived and fork parameters removed - always optimized to exclude archived repositories and forks for better quality

  language: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .language
    ),

  visibility: z
    .array(z.enum(['public', 'private', 'internal']))
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters
        .visibility
    ),
  app: z
    .string()
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.filters.app
    ),
  match: PRMatchScopeSchema,
  sort: z
    .enum(['created', 'updated', 'best-match'])
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.sorting.sort
    ),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.sorting.order
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(30)
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.resultLimit
        .limit
    ),

  withComments: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.outputShaping
        .withComments
    ),
  getFileChanges: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      SCHEME_DESCRIPTIONS_STRUCTURED.GITHUB_SEARCH_PULL_REQUESTS.outputShaping
        .getFileChanges
    ),
});

export type GitHubPullRequestSearchQuery = z.infer<
  typeof GitHubPullRequestSearchQuerySchema
>;

// Bulk schema for multiple pull request searches
export const GitHubPullRequestSearchBulkQuerySchema = createBulkQuerySchema(
  GitHubPullRequestSearchQuerySchema,
  'Pull request search queries'
);

// ============================================================================
// Simple Input/Output Types
// ============================================================================

/**
 * Tool input - bulk pull request search queries
 */
export interface GitHubSearchPullRequestsInput {
  queries: GitHubPullRequestSearchQuery[];
}

/**
 * Tool output - extends standardized ToolResponse format
 */
export interface GitHubSearchPullRequestsOutput extends ToolResponse {
  /** Primary data payload - array of pull request search results */
  data: PullRequestSearchResult[];
}

/**
 * Individual pull request search result
 */
export interface PullRequestSearchResult {
  queryId?: string;
  reasoning?: string;
  pull_requests?: PullRequestInfo[];
  total_count?: number;
  incomplete_results?: boolean;
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only on error
  metadata: Record<string, unknown>; // Required for bulk operations compatibility
}

/**
 * Simplified pull request information - preserves all essential GitHub API data
 */
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
    repo?: string; // Simplified to repository name
  };
  base: {
    ref: string;
    sha: string;
    repo: string; // Simplified to repository name
  };
  body?: string;
  comments?: number;
  review_comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  // Optional fields for when withComments=true or getFileChanges=true
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
