import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  GitHubOwnerSchema,
  GitHubRepoSchema,
  GitHubBranchSchema,
  BaseToolMeta,
} from './baseSchema';

export const GitHubViewRepoStructureQuerySchema = extendBaseQuerySchema({
  owner: GitHubOwnerSchema,
  repo: GitHubRepoSchema,
  branch: GitHubBranchSchema,
  path: z
    .string()
    .default('')
    .optional()
    .describe(
      'Directory path within repository. Start empty for root exploration'
    ),
  depth: z
    .number()
    .min(1)
    .max(2)
    .default(1)
    .optional()
    .describe(
      'Directory depth to explore. Default 1 (preferred). Max 2. Use sparingly.'
    ),
  includeIgnored: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      'Include config files, lock files, hidden directories. Default false for optimization'
    ),
  showMedia: z
    .boolean()
    .default(false)
    .optional()
    .describe('Include media files. Default false for optimization'),
});

export type GitHubViewRepoStructureQuery = z.infer<
  typeof GitHubViewRepoStructureQuerySchema
>;

// Bulk schema for multiple repository structure queries
export const GitHubViewRepoStructureBulkQuerySchema = createBulkQuerySchema(
  GitHubViewRepoStructureQuerySchema,
  1,
  5,
  'Array of 1-5 repository structure queries for bulk execution'
);

// Legacy interfaces - all point to the schema-derived type for consistency
export type GitHubRepositoryStructureQuery = GitHubViewRepoStructureQuery;
export type GitHubRepositoryStructureParams = GitHubViewRepoStructureQuery;

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

// Bulk operations types
export interface ProcessedRepoStructureResult {
  queryDescription?: string;
  repository?: string;
  branch?: string;
  path?: string;
  structure?: Array<{
    path: string;
    type: 'file' | 'dir' | 'symlink' | 'submodule';
    size?: number;
    sha?: string;
  }>;
  data?: unknown;
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>; // Required for processing, removed later if not verbose
}

// Legacy interface for backward compatibility
export interface ProcessedRepositoryStructureResult
  extends ProcessedRepoStructureResult {}

export interface GitHubRepositoryStructureMeta extends BaseToolMeta {
  repositories: Array<{ nameWithOwner: string; branch: string; path: string }>;
  totalRepositories: number;
  researchContext?: {
    foundDirectories: string[];
    foundFileTypes: string[];
    repositoryContexts: string[];
  };
}

// Aggregated context for bulk operations
export interface AggregatedRepositoryContext {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  foundDirectories: Set<string>;
  foundFileTypes: Set<string>;
  repositoryContexts: Set<string>;
  exploredPaths: Set<string>;
  dataQuality: {
    hasResults: boolean;
    hasContent: boolean;
    hasStructure: boolean;
  };
}

// Legacy schema for backward compatibility - now points to the main schema
export const GitHubRepositoryStructureQuerySchema =
  GitHubViewRepoStructureQuerySchema;
export const GitHubRepositoryStructureParamsSchema =
  GitHubViewRepoStructureQuerySchema;
