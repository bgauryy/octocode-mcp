import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_SEARCH_REPOS } from './schemDescriptions';
import { ToolResponse } from '../responses.js';
import { TOOL_NAMES } from '../constants';
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
    .describe(GITHUB_SEARCH_REPOS.search.keywordsToSearch),
  topicsToSearch: z
    .array(z.string())
    .optional()
    .describe(GITHUB_SEARCH_REPOS.search.topicsToSearch),
  owner: z.string().optional().describe(GITHUB_SEARCH_REPOS.scope.owner),
  stars: z.string().optional().describe(GITHUB_SEARCH_REPOS.filters.stars),
  size: z.string().optional().describe(GITHUB_SEARCH_REPOS.filters.size),
  created: z.string().optional().describe(GITHUB_SEARCH_REPOS.filters.created),
  updated: z.string().optional().describe(GITHUB_SEARCH_REPOS.filters.updated),
  match: z
    .array(z.enum(['name', 'description', 'readme']))
    .optional()
    .describe(GITHUB_SEARCH_REPOS.filters.match),
  sort: z
    .enum(['forks', 'stars', 'updated', 'best-match'])
    .optional()
    .describe(GITHUB_SEARCH_REPOS.sorting.sort),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(GITHUB_SEARCH_REPOS.resultLimit.limit),
});

export type GitHubReposSearchQuery = z.infer<
  typeof GitHubReposSearchSingleQuerySchema
>;

export const GitHubReposSearchQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
  GitHubReposSearchSingleQuerySchema
);

// ============================================================================
// Simple Input/Output Types
// ============================================================================

/**
 * Tool input - bulk repository search queries
 */
export interface GitHubSearchReposInput {
  queries: GitHubReposSearchQuery[];
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
  researchGoal?: string;
  reasoning?: string;
  repositories: SimplifiedRepository[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only on error
  metadata?: Record<string, unknown>; // Internal use
}
