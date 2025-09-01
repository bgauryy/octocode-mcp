import { z } from 'zod';
import { extendBaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import type { Repository } from '../github/github-openapi.js';

const GitHubReposSearchSingleQuerySchema = extendBaseQuerySchema({
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Search terms for repository names/descriptions'),
  owner: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('Repository owner/organization name(s)'),
  topic: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('Find repository by topic search - best for exploration'),
  language: z.string().nullable().optional().describe('Github language filter'),
  stars: z
    .union([z.number().min(0), z.string(), z.null()])
    .optional()
    .describe('Star count filter'),
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
      'Created date filter (e.g., ">2020-01-01", "2020-01-01..2023-12-31")'
    ),
  updated: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Updated date filter (e.g., ">2024-01-01", "2023-01-01..2024-12-31")'
    ),
  match: z
    .union([
      z.enum(['name', 'description', 'readme']),
      z.array(z.enum(['name', 'description', 'readme'])),
      z.null(),
    ])
    .optional()
    .describe('Search scope'),
  sort: z
    .enum(['forks', 'stars', 'updated', 'best-match'])
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
  repositories?: Repository[];
  total_count?: number;
  query?: Record<string, unknown>; // Include original query when verbose or no results
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>; // Required for bulk operations compatibility
}
