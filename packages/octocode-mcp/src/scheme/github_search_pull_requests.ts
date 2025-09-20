import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  FlexibleArraySchema,
  DateRangeSchema,
  PRMatchScopeSchema,
  SortingSchema,
  lockedSchema,
  draftSchema,
} from './baseSchema';

export const GitHubPullRequestSearchQuerySchema = extendBaseQuerySchema({
  query: z.string().optional().describe('Search query for PR content'),

  owner: FlexibleArraySchema.stringOrArray.describe(
    'Repository owner - single owner or array'
  ),
  repo: FlexibleArraySchema.stringOrArray.describe(
    'Repository name - single repo or array'
  ),

  // New parameter for fetching specific PR by number
  prNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Specific PR number to fetch. When provided with owner/repo, fetches the exact PR instead of searching'
    ),

  state: z
    .enum(['open', 'closed'])
    .optional()
    .describe('PR state: "open" or "closed"'),

  assignee: z.string().optional().describe('GitHub username of assignee'),
  author: z.string().optional().describe('GitHub username of PR author'),
  commenter: z.string().optional().describe('User who commented on PR'),
  involves: z.string().optional().describe('User involved in any way'),
  mentions: z.string().optional().describe('PRs mentioning this user'),
  'review-requested': z
    .string()
    .optional()
    .describe('User/team requested for review'),
  'reviewed-by': z.string().optional().describe('User who reviewed the PR'),
  'team-mentions': z
    .string()
    .optional()
    .describe('Team mentions (@org/team-name)'),

  label: FlexibleArraySchema.stringOrArray.describe(
    'Labels. Single label or array for OR logic'
  ),
  'no-label': z.boolean().optional().describe('PRs without labels'),

  milestone: z.string().optional().describe('Milestone title'),
  'no-milestone': z.boolean().optional().describe('PRs without milestones'),

  project: z.string().optional().describe('Project board owner/number'),
  'no-project': z.boolean().optional().describe('PRs not in projects'),

  'no-assignee': z.boolean().optional().describe('PRs without assignees'),

  head: z.string().optional().describe('Filter on head branch name'),
  base: z.string().optional().describe('Filter on base branch name'),

  created: DateRangeSchema.shape.created,
  updated: DateRangeSchema.shape.updated,
  closed: z
    .string()
    .optional()
    .describe('Closed date. Use ">2024-01-01", "2024-01-01..2024-12-31", etc.'),
  'merged-at': z
    .string()
    .optional()
    .describe('Merged date. Use ">2024-01-01", "2024-01-01..2024-12-31", etc.'),

  comments: FlexibleArraySchema.numberOrStringRange.describe(
    'Comment count. Use ">10", ">=5", "<20", "5..10", or exact number'
  ),
  reactions: FlexibleArraySchema.numberOrStringRange.describe(
    'Reaction count. Use ">100", ">=10", "<50", "10..50", or exact number'
  ),
  interactions: FlexibleArraySchema.numberOrStringRange.describe(
    'Total interactions (reactions + comments). Use ">50", "10..100", etc.'
  ),

  merged: z.boolean().optional().describe('Merged state'),
  draft: draftSchema,
  locked: lockedSchema,

  review: z
    .enum(['none', 'required', 'approved', 'changes_requested'])
    .optional()
    .describe('Review status'),
  checks: z
    .enum(['pending', 'success', 'failure'])
    .optional()
    .describe('CI checks status'),

  // archived and fork parameters removed - always optimized to exclude archived repositories and forks for better quality

  language: z.string().optional().describe('Programming language filter'),

  visibility: z
    .union([
      z.enum(['public', 'private', 'internal']),
      z.array(z.enum(['public', 'private', 'internal'])),
    ])
    .optional()
    .describe('Repository visibility'),

  app: z.string().optional().describe('GitHub App author'),

  match: PRMatchScopeSchema,

  sort: z
    .enum([
      'comments',
      'reactions',
      'reactions-+1',
      'reactions--1',
      'reactions-smile',
      'reactions-thinking_face',
      'reactions-heart',
      'reactions-tada',
      'interactions',
      'created',
      'updated',
      'best-match',
    ])
    .optional()
    .describe('Sort fetched results'),
  order: SortingSchema.shape.order,

  limit: z
    .number()
    .min(1)
    .max(100)
    .default(30)
    .optional()
    .describe('Maximum number of results to fetch'),

  withComments: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      'Include full comment content in search results. WARNING: EXTREMELY expensive in tokens'
    ),
  getFileChanges: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      'Include file changes/diffs in the PR. WARNING: EXTREMELY expensive in tokens'
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

export interface GitHubPullRequestSearchResult {
  total_count: number;
  incomplete_results: boolean;
  pull_requests: Array<{
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
    user: {
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
      repo?: {
        id: number;
        name: string;
        full_name: string;
        owner: {
          login: string;
          id: number;
        };
        private: boolean;
        html_url: string;
        default_branch: string;
      };
    };
    base: {
      ref: string;
      sha: string;
      repo: {
        id: number;
        name: string;
        full_name: string;
        owner: {
          login: string;
          id: number;
        };
        private: boolean;
        html_url: string;
        default_branch: string;
      };
    };
    body?: string;
    comments?: number;
    review_comments?: number;
    commits?: number;
    additions?: number;
    deletions?: number;
    changed_files?: number;
  }>;
}

export interface GitHubPullRequestSearchError {
  error: string;
  status?: number;
  hints?: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
}
