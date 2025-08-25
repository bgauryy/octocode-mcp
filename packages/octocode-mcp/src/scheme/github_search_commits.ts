import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';

export const GitHubCommitSearchQuerySchema = BaseQuerySchema.extend({
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Array of search terms (AND logic)'),
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
    .optional()
    .describe(
      'Filter by author date (e.g., ">2022-01-01", "2020-01-01..2021-01-01")'
    ),
  'committer-date': z
    .string()
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
  order: z
    .enum(['asc', 'desc'])
    .default('desc')
    .optional()
    .describe('Sort order direction'),
});

export type GitHubCommitSearchQuery = z.infer<
  typeof GitHubCommitSearchQuerySchema
>;

// Bulk schema for multiple commit searches
export const GitHubCommitSearchBulkQuerySchema = createBulkQuerySchema(
  GitHubCommitSearchQuerySchema,
  1,
  5,
  'Array of 1-5 commit search queries for bulk execution'
);

// Legacy types removed - all functions now return CallToolResult
// Data structures are now embedded in the CallToolResult.data field
