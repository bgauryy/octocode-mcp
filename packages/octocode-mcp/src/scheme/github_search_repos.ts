import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  FlexibleArraySchema,
  LimitSchema,
  DateRangeSchema,
  RepoMatchScopeSchema,
  SortingSchema,
} from './baseSchema';
import type { Repository } from '../github/github-openapi.js';

const GitHubReposSearchSingleQuerySchema = extendBaseQuerySchema({
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Search terms for repository names/descriptions'),
  owner: FlexibleArraySchema.stringOrArrayOrNull.describe(
    'Repository owner/organization name(s)'
  ),
  topic: FlexibleArraySchema.stringOrArrayOrNull.describe(
    'Find repository by topic search - best for exploration'
  ),
  language: z.string().nullable().optional().describe('Github language filter'),
  stars:
    FlexibleArraySchema.numberOrStringRangeOrNull.describe('Star count filter'),
  size: z
    .string()
    .nullable()
    .optional()
    .describe('Repository size filter in KB'),
  created: DateRangeSchema.shape.created,
  updated: DateRangeSchema.shape.updated,
  match: RepoMatchScopeSchema,
  sort: z
    .enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match'])
    .nullable()
    .optional()
    .describe('Sort criteria'),
  order: SortingSchema.shape.order.nullable().optional(),
  limit: LimitSchema.nullable().optional(),
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
