// Re-export all functions from the modular structure for backward compatibility
export {
  // Core client and utilities
  getOctokit,
  OctokitWithThrottling,
  getDefaultBranch,
  clearCachedToken,
  // Error handling
  handleGitHubAPIError,
  generateFileAccessHints,
  // Query builders
  getOwnerQualifier,
  buildCodeSearchQuery,
  buildRepoSearchQuery,
  buildPullRequestSearchQuery,
  buildCommitSearchQuery,
  shouldUseSearchForPRs,
  // Search operations
  searchGitHubCodeAPI,
  searchGitHubReposAPI,
  searchGitHubPullRequestsAPI,
  fetchGitHubPullRequestByNumberAPI,
  transformPullRequestItemFromREST,
  searchGitHubCommitsAPI,
  // File operations
  fetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI,
  // Authentication
} from '.';

// Re-export key types for backward compatibility
export type { components } from '@octokit/openapi-types';
export type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Export enhanced/custom types
export type {
  GitHubAPIResponse,
  GitHubAPISuccess,
  GitHubAPIError,
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
