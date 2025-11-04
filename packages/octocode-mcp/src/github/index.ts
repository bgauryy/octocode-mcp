// Core client and utilities
export {
  getOctokit,
  OctokitWithThrottling,
  getDefaultBranch,
  clearCachedToken,
} from './client';
export { handleGitHubAPIError } from './errors';

// Export enhanced/custom types and utilities
export type {
  GitHubAPIError,
  GitHubAPIResponse,
  GitHubAPISuccess,
  Repository,
  OptimizedCodeSearchResult,
  GitHubPullRequestItem,
  GitHubPullRequestsSearchParams,
  RepositoryReference,
  GetContentParameters,
  GetRepoResponse,
  isGitHubAPIError,
  isGitHubAPISuccess,
  isRepository,
} from './githubAPI';

// Re-export direct Octokit types for convenience
export type { components } from '@octokit/openapi-types';
export type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Query builders
export {
  buildCodeSearchQuery,
  buildRepoSearchQuery,
  buildPullRequestSearchQuery,
  shouldUseSearchForPRs,
} from './queryBuilders';

// Search operations
export { searchGitHubCodeAPI } from './codeSearch';
export { searchGitHubReposAPI } from './repoSearch';
export {
  searchGitHubPullRequestsAPI,
  fetchGitHubPullRequestByNumberAPI,
  transformPullRequestItemFromREST,
} from './pullRequestSearch';

// File operations
export {
  fetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI,
} from './fileOperations';
