import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { ToolResponse } from '../responses.js';

export const GitHubCodeSearchQuerySchema = BaseQuerySchema.extend({
  keywordsToSearch: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('Github search queries (AND logic in file)`'),
  owner: z.string().optional().describe('Repository owner'),
  repo: z.string().optional().describe('Repository name'),
  language: z.string().optional().describe('file language'),
  extension: z.string().optional().describe('file extension'),
  stars: z
    .string()
    .optional()
    .describe('Stars filter (e.g., ">100", ">=1000")'),
  filename: z
    .string()
    .optional()
    .describe(
      'Filter search results by filename patterns (e.g., "*.js", "*.tsx", "App.js")'
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Filter search results by file/directory path (e.g., "src/components", "README.md")'
    ),
  match: z
    .enum(['file', 'path'])
    .optional()
    .describe(
      'Controls WHERE to search for keywords: (default - in content), "path" (search keywords in filenames/paths)'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum number of results to return (1-20)'),
  minify: z.boolean().optional().default(true).describe('minify content'),
  sanitize: z.boolean().optional().default(true).describe('sanitize content'),
});

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;

export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  GitHubCodeSearchQuerySchema,
  'Code search queries'
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
