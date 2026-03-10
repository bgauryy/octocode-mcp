/**
 * Types for github_search_code tool (githubSearchCode)
 * @module tools/github_search_code/types
 */

import type { GitHubSearchCodeData } from '../../scheme/outputTypes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for GitHub code search
 */
export interface GitHubCodeSearchQuery {
  id?: string;
  keywordsToSearch: string[];
  owner?: string;
  repo?: string;
  extension?: string;
  filename?: string;
  path?: string;
  match?: 'file' | 'path';
  limit?: number;
  page?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type SearchResult = GitHubSearchCodeData;
