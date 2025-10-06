import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_SEARCH_PULL_REQUESTS } from './schemDescriptions';
import { ToolResponse } from '../responses.js';
import { TOOL_NAMES } from '../constants';

export const PRMatchScopeSchema = z
  .array(z.enum(['title', 'body', 'comments']))
  .optional()
  .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.match);

export const DateRangeSchema = z.object({
  created: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.created),
  updated: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.updated),
});

export const GitHubPullRequestSearchQuerySchema = BaseQuerySchema.extend({
  query: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.search.query),
  owner: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.scope.owner),
  repo: z.string().optional().describe(GITHUB_SEARCH_PULL_REQUESTS.scope.repo),
  prNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.scope.prNumber),
  state: z
    .enum(['open', 'closed'])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.state),
  assignee: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.assignee),
  author: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.author),
  commenter: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.commenter),
  involves: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.involves),
  mentions: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.mentions),
  'review-requested': z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['review-requested']),
  'reviewed-by': z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['reviewed-by']),
  label: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.label),
  'no-label': z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['no-label']),
  'no-milestone': z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['no-milestone']),
  'no-project': z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['no-project']),
  'no-assignee': z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['no-assignee']),
  head: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.head),
  base: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.base),
  created: DateRangeSchema.shape.created,
  updated: DateRangeSchema.shape.updated,
  closed: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.closed),
  'merged-at': z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['merged-at']),
  comments: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.comments),
  reactions: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.reactions),
  interactions: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.interactions),
  merged: z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.merged),
  draft: z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.draft),

  match: PRMatchScopeSchema,
  sort: z
    .enum(['created', 'updated', 'best-match'])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.sorting.sort),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe(GITHUB_SEARCH_PULL_REQUESTS.sorting.order),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(30)
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.resultLimit.limit),
  withComments: z
    .boolean()
    .default(false)
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.outputShaping.withComments),
  withContent: z
    .boolean()
    .default(false)
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.outputShaping.withContent),
});

export type GitHubPullRequestSearchQuery = z.infer<
  typeof GitHubPullRequestSearchQuerySchema
>;

export const GitHubPullRequestSearchBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
  GitHubPullRequestSearchQuerySchema
);

export interface GitHubSearchPullRequestsInput {
  queries: GitHubPullRequestSearchQuery[];
}

export interface GitHubSearchPullRequestsOutput extends ToolResponse {
  data: PullRequestSearchResult[];
}

export interface PullRequestSearchResult {
  researchGoal?: string;
  reasoning?: string;
  suggestions?: string[];
  pull_requests?: PullRequestInfo[];
  total_count?: number;
  incomplete_results?: boolean;
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only on error
  metadata: Record<string, unknown>;
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
  // Optional fields for when withComments=true or withContent=true
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
