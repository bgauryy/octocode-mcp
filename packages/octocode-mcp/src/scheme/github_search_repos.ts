import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
  SimpleArraySchema,
  LimitSchema,
} from './baseSchema';
import { ToolResponse } from '../responses.js';

// Simplified repository type for search results
export interface SimplifiedRepository {
  repository: string;
  stars: number;
  description: string;
  url: string;
  updatedAt: string;
}

const GitHubReposSearchSingleQuerySchema = BaseQuerySchema.extend({
  keywordsToSearch: z
    .array(z.string())
    .optional()
    .describe('terms for searching repos by name OR description'),
  topicsToSearch: SimpleArraySchema.stringOrArray
    .optional()
    .describe(
      'terms for searching repos by github topics- tag used to categorize repo'
    ),
  owner: SimpleArraySchema.stringOrArray.describe('Owner(s)'),
  language: z
    .string()
    .optional()
    .describe('Language - DO NOT USE ON EXPLORATORY SEARCHES'),
  stars: SimpleArraySchema.numberOrStringRange.describe('Stars'),
  size: z.string().optional().describe('Size KB'),
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
    .array(z.enum(['name', 'description', 'readme']))
    .optional()
    .describe('Scope'),
  sort: z
    .enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match'])
    .optional()
    .describe('Sort'),

  limit: LimitSchema,
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
