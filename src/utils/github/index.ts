// Core client and utilities
export { getOctokit, OctokitWithThrottling, getDefaultBranch } from './client';
export { handleGitHubAPIError, generateFileAccessHints } from './errors';

// Export OpenAPI types
export type {
  GitHubAPIError,
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
} from '../../types/github-openapi';

// Query builders
export {
  getOwnerQualifier,
  buildCodeSearchQuery,
  buildRepoSearchQuery,
  buildPullRequestSearchQuery,
  buildIssueSearchQuery,
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
export { searchGitHubIssuesAPI } from './issueSearch';
export { searchGitHubCommitsAPI } from './commitSearch';

// File operations
export {
  fetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI,
} from './fileOperations';

// Authentication
export { checkGitHubAuthAPI } from './auth';
