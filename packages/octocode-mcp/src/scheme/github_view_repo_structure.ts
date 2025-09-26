import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
  GitHubOwnerSchema,
  GitHubRepoSchema,
  GitHubBranchSchema,
} from './baseSchema';
import { ToolResponse } from '../responses.js';

export const GitHubViewRepoStructureQuerySchema = BaseQuerySchema.extend({
  owner: GitHubOwnerSchema,
  repo: GitHubRepoSchema,
  branch: GitHubBranchSchema,
  path: z.string().default('').optional().describe('Path'),
  depth: z
    .number()
    .min(1)
    .max(2)
    .default(1)
    .optional()
    .describe('Depth to expolore - max 2'),
});

export type GitHubViewRepoStructureQuery = z.infer<
  typeof GitHubViewRepoStructureQuerySchema
>;

// Bulk schema for multiple repository structure queries
export const GitHubViewRepoStructureBulkQuerySchema = createBulkQuerySchema(
  GitHubViewRepoStructureQuerySchema,
  'Repository structure exploration queries'
);

export interface GitHubApiFileItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

export interface GitHubRepositoryContentsResult {
  path: string;
  baseUrl: string;
  files: Array<{
    name: string;
    size: number;
    url: string;
  }>;
  folders: string[];
  branchFallback?: {
    requested: string;
    used: string;
    message: string;
  };
}

export interface GitHubRepositoryStructureResult {
  repository: string;
  branch: string;
  path: string;
  apiSource: boolean;
  summary: {
    totalFiles: number;
    totalFolders: number;
    truncated: boolean;
    filtered: boolean;
    originalCount: number;
  };
  files: Array<{
    path: string;
    size?: number;
    url: string;
  }>;
  folders: {
    count: number;
    folders: Array<{
      path: string;
      url: string;
    }>;
  };
}

export interface GitHubRepositoryStructureError {
  error: string;
  status?: number;
  triedBranches?: string[];
  defaultBranch?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

// ============================================================================
// Simple Input/Output Types
// ============================================================================

/**
 * Tool input - bulk repository structure queries
 */
export interface GitHubViewRepoStructureInput {
  queries: GitHubViewRepoStructureQuery[];
  verbose?: boolean;
}

/**
 * Tool output - extends standardized ToolResponse format
 */
export interface GitHubViewRepoStructureOutput extends ToolResponse {
  /** Primary data payload - array of repository structure results */
  data: RepoStructureResult[];
}

/**
 * Individual repository structure result
 */
export interface RepoStructureResult {
  queryId?: string;
  reasoning?: string;
  repository?: string;
  path?: string;
  files?: string[];
  folders?: string[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only when verbose or error
  metadata: Record<string, unknown>; // Required for bulk operations compatibility
}
