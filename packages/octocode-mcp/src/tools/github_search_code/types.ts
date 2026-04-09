/**
 * Types for github_search_code tool (githubSearchCode)
 * @module tools/github_search_code/types
 */

import type { GitHubSearchCodeData } from '@octocodeai/octocode-core';

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
  charOffset?: number;
  charLength?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

export type SearchResult = GitHubSearchCodeData;
