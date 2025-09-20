import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  FlexibleArraySchema,
  LimitSchema,
  DateRangeSchema,
} from './baseSchema';

// Simplified repository type for search results
export interface SimplifiedRepository {
  owner_repo: string;
  stars: number;
  description: string;
  language: string;
  url: string;
  forks: number;
  updatedAt: string;
}

const GitHubReposSearchSingleQuerySchema = extendBaseQuerySchema({
  queryTerms: z.array(z.string()).optional().describe('Terms'),
  owner: FlexibleArraySchema.stringOrArrayOrNull.describe('Owner(s)'),
  topic: FlexibleArraySchema.stringOrArrayOrNull.describe('Topics'),
  language: z.string().nullable().optional().describe('Language'),
  stars: FlexibleArraySchema.numberOrStringRangeOrNull.describe('Stars'),
  size: z.string().nullable().optional().describe('Size KB'),
  created: DateRangeSchema.shape.created,
  updated: DateRangeSchema.shape.updated,
  match: z
    .union([
      z.enum(['name', 'description', 'readme']),
      z.array(z.enum(['name', 'description', 'readme'])),
      z.null(),
    ])
    .optional()
    .describe('Scope'),
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
  'Repository search queries'
);

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface ProcessedRepoSearchResult {
  repositories?: SimplifiedRepository[];
  total_count?: number;
  query?: Record<string, unknown>; // Include original query when verbose or no results
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>; // Required for bulk operations compatibility
}
