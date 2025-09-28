import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_SEARCH_CODE } from './schemDescriptions';
import { ToolResponse } from '../responses.js';
import { TOOL_NAMES } from '../constants';

export const GitHubCodeSearchQuerySchema = BaseQuerySchema.extend({
  keywordsToSearch: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe(GITHUB_SEARCH_CODE.search.keywordsToSearch),
  owner: z.string().optional().describe(GITHUB_SEARCH_CODE.scope.owner),
  repo: z.string().optional().describe(GITHUB_SEARCH_CODE.scope.repo),
  extension: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_CODE.filters.extension),
  stars: z.string().optional().describe(GITHUB_SEARCH_CODE.filters.stars),
  filename: z.string().optional().describe(GITHUB_SEARCH_CODE.filters.filename),
  path: z.string().optional().describe(GITHUB_SEARCH_CODE.filters.path),
  match: z
    .enum(['file', 'path'])
    .optional()
    .describe(GITHUB_SEARCH_CODE.filters.match),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(GITHUB_SEARCH_CODE.resultLimit.limit),
  minify: z
    .boolean()
    .optional()
    .default(true)
    .describe(GITHUB_SEARCH_CODE.processing.minify),
  sanitize: z
    .boolean()
    .optional()
    .default(true)
    .describe(GITHUB_SEARCH_CODE.processing.sanitize),
});

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;

export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_SEARCH_CODE,
  GitHubCodeSearchQuerySchema
);

export interface GitHubSearchCodeInput {
  queries: GitHubCodeSearchQuery[];
}

/**
 * Tool output - extends standardized ToolResponse format
 */
export interface GitHubSearchCodeOutput extends ToolResponse {
  /** Primary data payload - array of search results */
  data: SearchResult[];
}

/**
 * Individual search result
 */
export interface SearchResult {
  queryId?: string;
  reasoning?: string;
  repository?: string;
  files: SearchFile[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only on error
  metadata?: Record<string, unknown>; // Internal use
}

/**
 * File match in search results
 */
export interface SearchFile {
  path: string;
  text_matches: string[];
}
