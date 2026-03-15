/**
 * Types for github_view_repo_structure tool (githubViewRepoStructure)
 * @module tools/github_view_repo_structure/types
 */

import type {
  GitHubRepoStructureDirectoryEntry,
  GitHubViewRepoStructureData,
  GitHubViewRepoStructureToolResult,
} from '../../scheme/outputTypes.js';

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
