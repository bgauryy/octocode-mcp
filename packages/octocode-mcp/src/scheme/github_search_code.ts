import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
  LimitSchema,
  FileMatchScopeSchema,
  MinifySchema,
  SanitizeSchema,
  SimpleArraySchema,
} from './baseSchema';
import { ToolResponse } from '../responses.js';

export const GitHubCodeSearchQuerySchema = BaseQuerySchema.extend({
  queryTerms: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('Github search queries (AND logic in file)`'),
  owner: SimpleArraySchema.stringOrArray,
  repo: SimpleArraySchema.stringOrArray,
  language: z.string().optional().describe('file language'),
  extension: z.string().optional().describe('file extension'),
  filename: z.string().optional().describe('File name'),
  path: z.string().optional().describe('Path'),
  stars: SimpleArraySchema.numberOrStringRange,
  match: FileMatchScopeSchema,
  limit: LimitSchema,
  minify: MinifySchema,
  sanitize: SanitizeSchema,
});

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;

export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  GitHubCodeSearchQuerySchema,
  'Code search queries'
);

export interface GitHubSearchCodeInput {
  queries: GitHubCodeSearchQuery[];
  verbose?: boolean;
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
  query?: Record<string, unknown>; // Only when verbose or error
  metadata?: Record<string, unknown>; // Internal use
}

/**
 * File match in search results
 */
export interface SearchFile {
  path: string;
  text_matches: string[];
}
