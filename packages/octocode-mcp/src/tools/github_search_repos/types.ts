/**
 * Types for github_search_repos tool (githubSearchRepositories)
 * @module tools/github_search_repos/types
 */

import type {
  GitHubRepositoryOutput,
  GitHubSearchRepositoriesData,
} from '@octocodeai/octocode-core';

/**
 * Query parameters for searching GitHub repositories
 */
export interface GitHubReposSearchQuery {
  id?: string;
  keywordsToSearch?: string[];
  topicsToSearch?: string[];
  owner?: string;
  stars?: string;
  size?: string;
  created?: string;
  updated?: string;
  match?: Array<'name' | 'description' | 'readme'>;
  sort?: 'forks' | 'stars' | 'updated' | 'best-match';
  limit?: number;
  page?: number;
  charOffset?: number;
  charLength?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

export type SimplifiedRepository = GitHubRepositoryOutput;

export type RepoSearchResult = GitHubSearchRepositoriesData;
