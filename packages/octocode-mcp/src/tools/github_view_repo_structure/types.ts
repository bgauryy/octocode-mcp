/**
 * Types for github_view_repo_structure tool (githubViewRepoStructure)
 * @module tools/github_view_repo_structure/types
 */

import type {
  GitHubRepoStructureDirectoryEntry,
  GitHubViewRepoStructureData,
  GitHubViewRepoStructureToolResult,
} from '@octocodeai/octocode-core';
import type { ContentDirectoryEntry } from '../../github/githubAPI.js';
import type { PaginationInfo } from '../../types.js';

/**
 * Query parameters for viewing repository structure
 */
export interface GitHubViewRepoStructureQuery {
  id?: string;
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  depth?: number;
  entriesPerPage?: number;
  entryPageNumber?: number;
  charOffset?: number;
  charLength?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

export type DirectoryEntry = GitHubRepoStructureDirectoryEntry;

export type RepoStructureResultData = GitHubViewRepoStructureData;

export type RepoStructureResult = GitHubViewRepoStructureToolResult;

/**
 * GitHub API file/directory item from content listing.
 * Schema: components['schemas']['content-directory'][number]
 */
export type GitHubApiFileItem = ContentDirectoryEntry;

export interface GitHubRepositoryStructureResult {
  owner: string;
  repo: string;
  branch: string;
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
  pagination?: PaginationInfo;
  hints?: string[];
  _cachedItems?: { path: string; type: 'file' | 'dir' }[];
}

export interface GitHubRepositoryStructureError {
  error: string;
  status?: number;
  triedBranches?: string[];
  defaultBranch?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}
