// Re-export all functions from the modular structure for backward compatibility
export {
  // Core client and utilities
  getOctokit,
  OctokitWithThrottling,
  getDefaultBranch,
  // Error handling
  handleGitHubAPIError,
  generateFileAccessHints,
  type GitHubAPIError,
  // Query builders
  getOwnerQualifier,
  buildCodeSearchQuery,
  buildRepoSearchQuery,
  buildPullRequestSearchQuery,
  buildIssueSearchQuery,
  buildCommitSearchQuery,
  shouldUseSearchForPRs,
  // Search operations
  searchGitHubCodeAPI,
  searchGitHubReposAPI,
  searchGitHubPullRequestsAPI,
  fetchGitHubPullRequestByNumberAPI,
  transformPullRequestItemFromREST,
  searchGitHubIssuesAPI,
  searchGitHubCommitsAPI,
  // File operations
  fetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI,
  // Authentication
  checkGitHubAuthAPI,
} from './github';

// Re-export OpenAPI types for backward compatibility
export type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Export new OpenAPI types
export type {
  GitHubAPIResponse,
  GitHubAPISuccess,
  Repository,
  SimpleUser,
  Issue,
  PullRequest,
  Commit,
  CodeSearchResultItem,
  RepoSearchResultItem,
  IssueSearchResultItem,
  CommitSearchResultItem,
  SearchCodeParameters,
  SearchCodeResponse,
  SearchReposParameters,
  SearchReposResponse,
  SearchIssuesParameters,
  SearchIssuesResponse,
  SearchCommitsParameters,
  SearchCommitsResponse,
  GetContentParameters,
  GetContentResponse,
  GetRepoParameters,
  GetRepoResponse,
  GetPullRequestParameters,
  GetPullRequestResponse,
  ListPullRequestsParameters,
  ListPullRequestsResponse,
  ListIssueCommentsParameters,
  ListIssueCommentsResponse,
  GetAuthenticatedUserResponse,
  SortOrder,
  SearchCodeSort,
  SearchReposSort,
  SearchIssuesSort,
  SearchCommitsSort,
  IssueState,
  PullRequestState,
  RepositoryVisibility,
  ContentType,
  isGitHubAPIError,
  isGitHubAPISuccess,
  isRepository,
  isUser,
  isSearchResultItem,
} from '../types/github-openapi';
