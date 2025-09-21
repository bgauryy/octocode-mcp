import { z } from 'zod';
import {
  BaseBulkQueryItemSchema,
  createBulkQuerySchema,
  GitHubOwnerSchema,
  GitHubRepoSchema,
  GitHubBranchSchema,
} from './baseSchema';

export const GitHubViewRepoStructureQuerySchema =
  BaseBulkQueryItemSchema.extend({
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
      .describe('Depth to expolore'),
    includeIgnored: z
      .boolean()
      .default(false)
      .optional()
      .describe('Include ignored files'),
    showMedia: z
      .boolean()
      .default(false)
      .optional()
      .describe('Include meida files'),
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

// Bulk operations types
export interface ProcessedRepositoryStructureResult {
  queryId?: string;
  reasoning?: string;
  repository?: string;
  branch?: string;
  path?: string;
  files?: string[];
  folders?: string[];
  data?: unknown;
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>; // Required for processing, removed later if not verbose
}

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
