import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  GitHubOwnerSchema,
  GitHubRepoSchema,
  GitHubFilePathSchema,
  GitHubBranchSchema,
  MinifySchema,
  SanitizeSchema,
} from './baseSchema';

export const FileContentQuerySchema = extendBaseQuerySchema({
  owner: GitHubOwnerSchema,
  repo: GitHubRepoSchema,
  filePath: GitHubFilePathSchema,
  branch: GitHubBranchSchema.optional(),
  fullContent: z.boolean().default(false).describe('Return entire file'),
  startLine: z.number().int().min(1).optional().describe('Start line in file'),
  endLine: z.number().int().min(1).optional().describe('End line in file'),
  matchString: z.string().optional().describe('Pattern to search in file'),
  matchStringContextLines: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(5)
    .describe('Lines before and after matchString'),
  minified: MinifySchema,
  sanitize: SanitizeSchema,
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

// Bulk schema for multiple file content queries
export const FileContentBulkQuerySchema = createBulkQuerySchema(
  FileContentQuerySchema,
  'File content fetch queries'
);

export interface FileContentQueryResult {
  queryId?: string;
  queryDescription?: string;
  originalQuery?: FileContentQuery;
  result: GitHubFileContentResponse | { error: string; hints?: string[] };
  error?: string;
  sampling?: {
    codeExplanation: string;
    filePath: string;
    repo: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    stopReason?: string;
  };
}
export interface GitHubFileContentResponse {
  filePath: string;
  owner: string;
  repo: string;
  branch: string;
  content: string;
  // Actual content boundaries (with context applied)
  startLine?: number;
  endLine?: number;
  totalLines: number; // Always returned - total lines in the file
  isPartial?: boolean;
  minified?: boolean;
  minificationFailed?: boolean;
  minificationType?:
    | 'terser'
    | 'conservative'
    | 'aggressive'
    | 'json'
    | 'general'
    | 'markdown'
    | 'failed'
    | 'none';
  // Security metadata
  securityWarnings?: string[];
}

export interface GitHubFileContentError {
  error: string;
  status?: number;
  hints?: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
}
