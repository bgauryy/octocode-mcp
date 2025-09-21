import { z } from 'zod';
import {
  BaseSingleQuerySchema,
  createBulkQuerySchema,
  SortingSchema,
} from './baseSchema';

export const GitHubCommitSearchQuerySchema = BaseSingleQuerySchema.extend({
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Search terms for commit messages (AND logic)'),
  orTerms: z
    .array(z.string())
    .optional()
    .describe('Array of search terms (OR logic)'),

  owner: z.string().optional().describe('Repository owner'),
  repo: z.string().optional().describe('Repository name'),

  author: z.string().optional().describe('GitHub username of commit author'),
  'author-name': z.string().optional().describe('Full name of commit author'),
  'author-email': z.string().optional().describe('Email of commit author'),

  committer: z.string().optional().describe('GitHub username of committer'),
  'committer-name': z.string().optional().describe('Full name of committer'),
  'committer-email': z.string().optional().describe('Email of committer'),

  'author-date': z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Filter by author date (e.g., ">2022-01-01", "2020-01-01..2021-01-01")'
    ),
  'committer-date': z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Filter by commit date (e.g., ">2022-01-01", "2020-01-01..2021-01-01")'
    ),

  hash: z.string().optional().describe('Commit SHA (full or partial)'),
  parent: z.string().optional().describe('Parent commit SHA'),
  tree: z.string().optional().describe('Tree SHA'),

  merge: z
    .boolean()
    .optional()
    .describe('Only merge commits (true) or exclude them (false)'),

  visibility: z
    .enum(['public', 'private', 'internal'])
    .optional()
    .describe('Repository visibility filter'),

  limit: z
    .number()
    .min(1)
    .max(50)
    .default(25)
    .optional()
    .describe('Maximum number of results to fetch'),
  getChangesContent: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      'Fetch actual commit changes (diffs/patches). WARNING: EXTREMELY expensive in tokens'
    ),

  sort: z
    .enum(['author-date', 'committer-date'])
    .optional()
    .describe('Sort by date field'),
  order: SortingSchema.shape.order,
});

export type GitHubCommitSearchQuery = z.infer<
  typeof GitHubCommitSearchQuerySchema
>;

// Bulk schema for multiple commit searches
export const GitHubCommitSearchBulkQuerySchema = createBulkQuerySchema(
  GitHubCommitSearchQuerySchema,
  'Commit search queries'
);

export type GitHubCommitSearchBulkQuery = z.infer<
  typeof GitHubCommitSearchBulkQuerySchema
>;

export interface GitHubCommitSearchResult {
  total_count: number;
  incomplete_results: boolean;
  commits: Array<{
    sha: string;
    node_id: string;
    url: string;
    html_url: string;
    commit: {
      message: string;
      author: {
        name: string;
        email: string;
        date: string;
      };
      committer: {
        name: string;
        email: string;
        date: string;
      };
      tree: {
        sha: string;
        url: string;
      };
      verification?: {
        verified: boolean;
        reason: string;
        signature?: string;
        payload?: string;
      };
    };
    author?: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
    };
    committer?: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
    };
    parents: Array<{
      sha: string;
      url: string;
      html_url: string;
    }>;
    repository?: {
      id: number;
      name: string;
      full_name: string;
      owner: {
        login: string;
        id: number;
      };
      private: boolean;
      html_url: string;
      description?: string;
    };
    score: number;
    // Optional fields for when getChangesContent=true
    files?: Array<{
      sha?: string;
      filename: string;
      status:
        | 'added'
        | 'removed'
        | 'modified'
        | 'renamed'
        | 'copied'
        | 'changed'
        | 'unchanged';
      additions: number;
      deletions: number;
      changes: number;
      blob_url?: string;
      raw_url?: string;
      contents_url?: string;
      patch?: string;
      previous_filename?: string;
    }>;
    stats?: {
      total: number;
      additions: number;
      deletions: number;
    };
  }>;
}

export interface GitHubCommitSearchError {
  error: string;
  status?: number;
  hints?: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
}
