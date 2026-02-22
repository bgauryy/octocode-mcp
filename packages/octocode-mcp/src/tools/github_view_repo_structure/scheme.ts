import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import {
  GITHUB_VIEW_REPO_STRUCTURE,
  TOOL_NAMES,
} from '../toolMetadata/index.js';
import type { PaginationInfo } from '../../types.js';
import type { DirectoryEntry } from './types.js';
import type { ContentDirectoryEntry } from '../../github/githubAPI.js';

/** Default entries per page for GitHub repo structure pagination */
export const GITHUB_STRUCTURE_DEFAULTS = {
  ENTRIES_PER_PAGE: 50,
  MAX_ENTRIES_PER_PAGE: 200,
} as const;

export const GitHubViewRepoStructureQuerySchema = BaseQuerySchema.extend({
  owner: z
    .string()
    .min(1)
    .max(200)
    .describe(GITHUB_VIEW_REPO_STRUCTURE.scope.owner),
  repo: z
    .string()
    .min(1)
    .max(150)
    .describe(GITHUB_VIEW_REPO_STRUCTURE.scope.repo),
  branch: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      'Branch to clone. Omit to use the repository\'s default branch (usually "main").'
    ),
  path: z
    .string()
    .optional()
    .default('')
    .describe(GITHUB_VIEW_REPO_STRUCTURE.scope.path),
  depth: z
    .number()
    .int()
    .min(1)
    .max(2)
    .optional()
    .default(1)
    .describe(GITHUB_VIEW_REPO_STRUCTURE.range.depth),
  entriesPerPage: z
    .number()
    .int()
    .min(1)
    .max(GITHUB_STRUCTURE_DEFAULTS.MAX_ENTRIES_PER_PAGE)
    .optional()
    .default(GITHUB_STRUCTURE_DEFAULTS.ENTRIES_PER_PAGE)
    .describe(GITHUB_VIEW_REPO_STRUCTURE.pagination.entriesPerPage),
  entryPageNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(GITHUB_VIEW_REPO_STRUCTURE.pagination.entryPageNumber),
});

export const GitHubViewRepoStructureBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
  GitHubViewRepoStructureQuerySchema
);

/**
 * GitHub API file/directory item from content listing.
 * Re-exported from Octokit's OpenAPI types for proper type safety.
 * Schema: components['schemas']['content-directory'][number]
 */
export type GitHubApiFileItem = ContentDirectoryEntry;

/** Internal item for caching (pre-pagination) */
interface CachedStructureItem {
  path: string;
  type: 'file' | 'dir';
}

export interface GitHubRepositoryStructureResult {
  owner: string;
  repo: string;
  branch: string;
  /** Default branch of the repository (populated when a branch fallback occurred) */
  defaultBranch?: string;
  path: string;
  apiSource: boolean;
  summary: {
    totalFiles: number;
    totalFolders: number;
    truncated: boolean;
    filtered: boolean;
    originalCount: number;
  };
  structure: Record<string, DirectoryEntry>;
  /** Pagination info when results are paginated */
  pagination?: PaginationInfo;
  /** Hints for next steps (including pagination hints) */
  hints?: string[];
  /** Internal: raw items for post-cache pagination (not serialized in responses) */
  _cachedItems?: CachedStructureItem[];
}

export interface GitHubRepositoryStructureError {
  error: string;
  status?: number;
  triedBranches?: string[];
  defaultBranch?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}
