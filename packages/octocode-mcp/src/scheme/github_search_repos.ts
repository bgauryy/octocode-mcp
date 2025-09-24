import { z } from 'zod';
import {
  BaseBulkQueryItemSchema,
  createBulkQuerySchema,
  FlexibleArraySchema,
  LimitSchema,
} from './baseSchema';
import { ToolResponse } from '../responses.js';

// Simplified repository type for search results
export interface SimplifiedRepository {
  owner_repo: string;
  stars: number;
  description: string;
  url: string;
  updatedAt: string;
}

const GitHubReposSearchSingleQuerySchema = BaseBulkQueryItemSchema.extend({
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('search repos by search terms'),
  owner: FlexibleArraySchema.stringOrArrayOrNull.describe('Owner(s)'),
  topics: FlexibleArraySchema.stringOrArrayOrNull.describe(
    'search repos by github topics'
  ),
  language: z.string().nullable().optional().describe('Language'),
  stars: FlexibleArraySchema.numberOrStringRangeOrNull.describe('Stars'),
  size: z.string().nullable().optional().describe('Size KB'),
  created: z
    .string()
    .optional()
    .describe(
      'Repository creation date filter (YYYY-MM-DD, >=YYYY-MM-DD, <=YYYY-MM-DD, YYYY-MM-DD..YYYY-MM-DD)'
    ),
  updated: z
    .string()
    .optional()
    .describe(
      'Repository last update date filter (YYYY-MM-DD, >=YYYY-MM-DD, <=YYYY-MM-DD, YYYY-MM-DD..YYYY-MM-DD)'
    ),
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
// Simple Input/Output Types
// ============================================================================

/**
 * Tool input - bulk repository search queries
 */
export interface GitHubSearchReposInput {
  queries: GitHubReposSearchQuery[];
  verbose?: boolean;
}

/**
 * Tool output - extends standardized ToolResponse format
 */
export interface GitHubSearchReposOutput extends ToolResponse {
  /** Primary data payload - array of repository search results */
  data: RepoSearchResult[];
}

/**
 * Individual repository search result
 */
export interface RepoSearchResult {
  queryId?: string;
  reasoning?: string;
  repositories: SimplifiedRepository[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only when verbose or error
  metadata?: Record<string, unknown>; // Internal use
}
