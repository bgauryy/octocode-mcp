import { z } from 'zod';
import { extendBaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import type { Repository } from '../../types/github-openapi';

// ============================================================================
// REPOSITORY SEARCH QUERY SCHEMA
// ============================================================================

const GitHubReposSearchSingleQuerySchema = extendBaseQuerySchema({
  // Query terms (for name/description search)
  queryTerms: z
    .array(z.string())
    .optional()
    .describe(
      'Search terms for repo names/descriptions (e.g., ["todo app"], ["authentication"])'
    ),

  // Repository filters
  owner: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('Repository owner/organization name(s)'),
  topic: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe(
      'Find repos by topic/technology (e.g., ["react", "typescript"], ["machine-learning"])'
    ),
  language: z
    .string()
    .nullable()
    .optional()
    .describe('Programming language filter (e.g., "typescript", "python")'),
  license: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('License filter'),

  // Quality and activity filters
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
  // archived and fork parameters removed - always optimized to exclude archived repositories and forks for better quality
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
    repositories?: Repository[];
    total_count?: number;
  };
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>;
}
