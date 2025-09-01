import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  FlexibleArraySchema,
  LimitSchema,
  DateRangeSchema,
  RepoMatchScopeSchema,
} from './baseSchema';
import type { Repository } from '../github/github-openapi.js';

const GitHubReposSearchSingleQuerySchema = extendBaseQuerySchema({
  queryTerms: z.array(z.string()).optional().describe('Terms'),
  owner: FlexibleArraySchema.stringOrArrayOrNull.describe('Owner(s)'),
  topic: FlexibleArraySchema.stringOrArrayOrNull.describe('Topics'),
  language: z.string().nullable().optional().describe('Language'),
  stars: FlexibleArraySchema.numberOrStringRangeOrNull.describe('Stars'),
  size: z.string().nullable().optional().describe('Size KB'),
  created: DateRangeSchema.shape.created,
  updated: DateRangeSchema.shape.updated,
  match: RepoMatchScopeSchema,
  sort: z
    .enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match'])
    .nullable()
    .optional()
    .describe('Sort'),

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
  'Queries'
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
