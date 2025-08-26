// Core client and utilities
export {
  getOctokit,
  OctokitWithThrottling,
  getDefaultBranch,
  clearCachedToken,
} from './client';
export { handleGitHubAPIError, generateFileAccessHints } from './errors';

// Export enhanced/custom types and utilities
export type {
  GitHubAPIError,
  GitHubAPIResponse,
  GitHubAPISuccess,
  Repository,
  WorkflowRun,
  CheckRun,
  OptimizedCodeSearchResult,
  OptimizedCommitSearchResult,
  GitHubPullRequestItem,
  GitHubCommitSearchParams,
  GitHubPullRequestsSearchParams,
  RepositoryReference,
  GitHubCommitDiff,
  GitHubPullRequestDiff,
  EnhancedSearchResult,
  GetContentParameters,
  GetRepoResponse,
  isGitHubAPIError,
  isGitHubAPISuccess,
  isRepository,
  isSearchResultItem,
  isPullRequest,
  isWorkflowRun,
  isCheckRun,
} from './github-openapi';

// Re-export direct Octokit types for convenience
export type { components } from '@octokit/openapi-types';
export type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Query builders
export {
  getOwnerQualifier,
  buildCodeSearchQuery,
  buildRepoSearchQuery,
  buildPullRequestSearchQuery,
  buildCommitSearchQuery,
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
export { searchGitHubCommitsAPI } from './commitSearch';

// File operations
export {
  fetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI,
} from './fileOperations';
