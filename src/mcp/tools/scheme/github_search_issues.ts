import { z } from 'zod';
import { BaseQuerySchema } from './baseSchema';

export const GitHubIssueSearchQuerySchema = BaseQuerySchema.extend({
  query: z.string().min(1).describe('Search terms for issues'),
  owner: z.string().optional().describe('Repository owner/organization name'),
  repo: z.string().optional().describe('Repository name (use with owner)'),

  state: z.enum(['open', 'closed']).optional().describe('Issue state'),

  assignee: z.string().optional().describe('GitHub username of assignee'),
  'no-assignee': z.boolean().optional().describe('Issues without assignees'),

  author: z.string().optional().describe('GitHub username of issue creator'),
  mentions: z.string().optional().describe('Issues mentioning this user'),
  commenter: z.string().optional().describe('User who commented on issue'),
  involves: z.string().optional().describe('User involved in any way'),
  'team-mentions': z
    .string()
    .optional()
    .describe('Team mentions (@org/team-name)'),

  label: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Label names (single or array)'),
  'no-label': z.boolean().optional().describe('Issues without labels'),

  milestone: z.string().optional().describe('Milestone name'),
  'no-milestone': z.boolean().optional().describe('Issues without milestone'),

  project: z.string().optional().describe('Project board number'),
  'no-project': z.boolean().optional().describe('Issues not in projects'),

  created: z
    .string()
    .optional()
    .describe(
      'Created date filter (e.g., ">2020-01-01", "2020-01-01..2023-12-31")'
    ),
  updated: z
    .string()
    .optional()
    .describe(
      'Updated date filter (e.g., ">2020-01-01", "2020-01-01..2023-12-31")'
    ),
  closed: z
    .string()
    .optional()
    .describe(
      'Closed date filter (e.g., ">2020-01-01", "2020-01-01..2023-12-31")'
    ),

  comments: z
    .union([z.number(), z.string()])
    .optional()
    .describe('Comment count filter (e.g., ">10", ">=5", "5..10")'),
  reactions: z
    .union([z.number(), z.string()])
    .optional()
    .describe('Reaction count filter (e.g., ">10", ">=5", "5..10")'),
  interactions: z
    .union([z.number(), z.string()])
    .optional()
    .describe('Total interactions filter (e.g., ">100", "50..200")'),

  archived: z.boolean().optional().describe('Include archived repositories'),
  locked: z.boolean().optional().describe('Conversation locked status'),

  language: z.string().optional().describe('Repository language'),

  sort: z
    .enum([
      'comments',
      'created',
      'interactions',
      'reactions',
      'reactions-+1',
      'reactions--1',
      'reactions-heart',
      'reactions-smile',
      'reactions-tada',
      'reactions-thinking_face',
      'updated',
      'best-match',
    ])
    .optional()
    .describe('Sort by activity or reactions'),
  order: z
    .enum(['asc', 'desc'])
    .default('desc')
    .optional()
    .describe('Sort order'),

  limit: z
    .number()
    .min(1)
    .max(50)
    .default(25)
    .optional()
    .describe('Results limit (1-50)'),

  match: z
    .enum(['title', 'body', 'comments'])
    .optional()
    .describe(
      'Search scope (title, body, or comments - WARNING: body and comments are expensive)'
    ),

  visibility: z
    .enum(['public', 'private', 'internal'])
    .optional()
    .describe('Repository visibility'),
  'include-prs': z
    .boolean()
    .optional()
    .describe('Include pull requests (default: false)'),
});

export type GitHubIssueSearchQuery = z.infer<
  typeof GitHubIssueSearchQuerySchema
>;

export interface GitHubIssueSearchResult {
  total_count: number;
  incomplete_results: boolean;
  issues: Array<{
    id: number;
    number: number;
    title: string;
    url: string;
    html_url: string;
    repository_url: string;
    labels_url: string;
    comments_url: string;
    events_url: string;
    state: 'open' | 'closed';
    state_reason?: string | null;
    created_at: string;
    updated_at: string;
    closed_at?: string | null;
    body?: string | null;
    user: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
      type: string;
    };
    assignee?: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
      type: string;
    } | null;
    assignees?: Array<{
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
      type: string;
    }>;
    labels: Array<{
      id: number;
      name: string;
      color: string;
      description?: string | null;
      default: boolean;
    }>;
    milestone?: {
      id: number;
      number: number;
      title: string;
      description?: string | null;
      state: 'open' | 'closed';
      created_at: string;
      updated_at: string;
      due_on?: string | null;
      closed_at?: string | null;
    } | null;
    locked: boolean;
    active_lock_reason?: string | null;
    comments: number;
    reactions: {
      '+1': number;
      '-1': number;
      laugh: number;
      hooray: number;
      confused: number;
      heart: number;
      rocket: number;
      eyes: number;
      total_count: number;
      url: string;
    };
    repository?: {
      id: number;
      name: string;
      full_name: string;
      owner: {
        login: string;
        id: number;
        type: string;
      };
      private: boolean;
      html_url: string;
      description?: string | null;
      fork: boolean;
      language?: string | null;
      stargazers_count: number;
      watchers_count: number;
      forks_count: number;
      open_issues_count: number;
      default_branch: string;
    };
    score: number;
    // Pull request specific fields (when issue is a PR)
    pull_request?: {
      url: string;
      html_url: string;
      diff_url: string;
      patch_url: string;
      merged_at?: string | null;
    };
  }>;
}

export interface GitHubIssueSearchError {
  error: string;
  status?: number;
  hints?: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
}
