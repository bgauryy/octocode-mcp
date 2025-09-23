import { z } from 'zod';
import {
  BaseBulkQueryItemSchema,
  createBulkQuerySchema,
  SortingSchema,
} from './baseSchema';
import { ToolResponse } from '../responses.js';

export const GitHubCommitSearchQuerySchema = BaseBulkQueryItemSchema.extend({
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

// ============================================================================
// Simple Input/Output Types
// ============================================================================

/**
 * Tool input - bulk commit search queries
 */
export interface GitHubSearchCommitsInput {
  queries: GitHubCommitSearchQuery[];
  verbose?: boolean;
}

/**
 * Tool output - extends standardized ToolResponse format
 */
export interface GitHubSearchCommitsOutput extends ToolResponse {
  /** Primary data payload - array of commit search results */
  data: CommitSearchResult[];

  /** Additional context with operation counts */
  meta: ToolResponse['meta'] & {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
  };
}

/**
 * Individual commit search result
 */
export interface CommitSearchResult {
  queryId?: string;
  reasoning?: string;
  commits?: CommitInfo[];
  total_count?: number;
  incomplete_results?: boolean;
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only when verbose or error
  metadata: Record<string, unknown>; // Required for bulk operations compatibility
}

/**
 * Simplified commit information
 */
export interface CommitInfo {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
    login?: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
    login?: string;
  };
  url: string;
  html_url: string;
  repository?: string;
  // Optional fields for when getChangesContent=true
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>;
  stats?: {
    total: number;
    additions: number;
    deletions: number;
  };
}
