/**
 * Types for github_view_repo_structure tool (githubViewRepoStructure)
 * @module tools/github_view_repo_structure/types
 */

import type {
  GitHubRepoStructureDirectoryEntry,
  GitHubViewRepoStructureData,
  GitHubViewRepoStructureToolResult,
} from '../../scheme/outputTypes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

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
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type DirectoryEntry = GitHubRepoStructureDirectoryEntry;

export type RepoStructureResultData = GitHubViewRepoStructureData;

export type RepoStructureResult = GitHubViewRepoStructureToolResult;
