import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  FlexibleArraySchema,
  LimitSchema,
  FileMatchScopeSchema,
  DateRangeSchema,
  NumericRangeSchema,
  MinifySchema,
  SanitizeSchema,
} from './baseSchema';

export const GitHubCodeSearchQuerySchema = extendBaseQuerySchema({
  queryTerms: z.array(z.string()).min(1).max(4).describe('Terms (AND)'),
  owner: FlexibleArraySchema.stringOrArray.describe('Repository owner'),
  repo: FlexibleArraySchema.stringOrArray.describe('Repository name'),
  language: z.string().optional().describe('Language'),
  extension: z.string().optional().describe('file extension'),
  filename: z.string().optional().describe('Filename'),
  path: z.string().optional().describe('Path'),
  stars: NumericRangeSchema.shape.stars,
  pushed: DateRangeSchema.shape.updated.describe('Pushed'),
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
