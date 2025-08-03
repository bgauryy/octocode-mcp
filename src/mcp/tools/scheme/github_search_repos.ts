import { z } from 'zod';
import { extendBaseQuerySchema, createBulkQuerySchema } from './baseSchema';

// ============================================================================
// REPOSITORY SEARCH QUERY SCHEMA
// ============================================================================

const GitHubReposSearchSingleQuerySchema = extendBaseQuerySchema({
  // Query terms (one of these is required)
  exactQuery: z.string().optional().describe('Single exact phrase/word search'),
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Multiple search terms for broader coverage'),

  // Repository filters
  owner: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('Repository owner/organization name(s)'),
  topic: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('Find repositories by technology/subject'),
  language: z
    .string()
    .nullable()
    .optional()
    .describe('Programming language filter'),
  license: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('License filter'),

  // Quality and activity filters
  stars: z
    .union([z.number().min(0), z.string(), z.null()])
    .optional()
    .describe('Star count filter'),
  forks: z
    .union([z.number().min(0), z.string(), z.null()])
    .optional()
    .describe('Fork count filter'),
  size: z
    .string()
    .nullable()
    .optional()
    .describe('Repository size filter in KB'),
  created: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Creation date filter. Format: ">2020-01-01", ">=2020-01-01", "<2023-12-31", "2020-01-01..2023-12-31"'
    ),
  updated: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Last updated date filter. Format: ">2024-01-01", ">=2024-01-01", "<2022-01-01", "2023-01-01..2024-12-31"'
    ),

  // Community and contribution filters
  followers: z
    .union([z.number().min(0), z.string(), z.null()])
    .optional()
    .describe('Repository owner followers count'),
  'good-first-issues': z
    .union([z.number().min(0), z.string(), z.null()])
    .optional()
    .describe('Good first issues count'),
  'help-wanted-issues': z
    .union([z.number().min(0), z.string(), z.null()])
    .optional()
    .describe('Help wanted issues count'),
  'number-topics': z
    .union([z.number().min(0), z.string(), z.null()])
    .optional()
    .describe('Number of topics filter'),

  // Repository characteristics
  archived: z.boolean().optional().describe('Archive status filter'),
  'include-forks': z
    .enum(['false', 'true', 'only'])
    .nullable()
    .optional()
    .describe('Fork inclusion'),
  visibility: z
    .enum(['public', 'private', 'internal'])
    .nullable()
    .optional()
    .describe('Repository visibility'),

  // Search configuration
  match: z
    .union([
      z.enum(['name', 'description', 'readme']),
      z.array(z.enum(['name', 'description', 'readme'])),
      z.null(),
    ])
    .optional()
    .describe('Search scope'),

  // Result configuration
  sort: z
    .enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match'])
    .nullable()
    .optional()
    .describe('Sort criteria'),
  order: z
    .enum(['asc', 'desc'])
    .nullable()
    .optional()
    .describe('Sort order direction'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .nullable()
    .optional()
    .describe('Maximum number of repositories to return (1-100)'),
});

export type GitHubReposSearchQuery = z.infer<
  typeof GitHubReposSearchSingleQuerySchema
>;

// Bulk schema for tool registration
export const GitHubReposSearchQuerySchema = createBulkQuerySchema(
  GitHubReposSearchSingleQuerySchema,
  1,
  5,
  'Array of 1-5 repository search queries for bulk execution'
);

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface ProcessedRepoSearchResult {
  queryId: string;
  data?: {
    repositories?: any[];
    total_count?: number;
  };
  error?: string;
  hints?: string[];
  metadata: {
    queryArgs?: any;
    error?: string;
    searchType?: string;
    suggestions?: any;
    researchGoal?: string;
  };
}
