import { z } from 'zod';
import {
  BaseBulkQueryItemSchema,
  createBulkQuerySchema,
  LimitSchema,
  FileMatchScopeSchema,
  NumericRangeSchema,
  MinifySchema,
  SanitizeSchema,
  GitHubOwnerSchema,
  GitHubRepoSchema,
} from './baseSchema';

export const GitHubCodeSearchQuerySchema = BaseBulkQueryItemSchema.extend({
  queryTerms: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('Github search queries (AND logic in file)`'),
  owner: z.union([GitHubOwnerSchema, z.array(GitHubOwnerSchema)]).optional(),
  repo: z.union([GitHubRepoSchema, z.array(GitHubRepoSchema)]).optional(),
  language: z.string().optional().describe('file language'),
  extension: z.string().optional().describe('file extension'),
  filename: z.string().optional().describe('File name'),
  path: z.string().optional().describe('Path'),
  stars: NumericRangeSchema.shape.stars,
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

export interface ProcessedCodeSearchResult {
  queryId?: string;
  queryDescription?: string;
  reasoning?: string;
  files?: Array<{
    path: string;
    text_matches: string[]; // Array of fragment strings only
  }>;
  totalCount?: number;
  repository?: string;
  query?: Record<string, unknown>; // Include original query when verbose or no results
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>; // Required for bulk operations compatibility
}
