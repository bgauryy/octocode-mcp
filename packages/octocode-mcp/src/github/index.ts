// Core client and utilities
export {
  getOctokit,
  OctokitWithThrottling,
  getDefaultBranch,
  clearCachedToken,
} from './client';
export { handleGitHubAPIError, generateFileAccessHints } from './errors';

// Export OpenAPI types
export type {
  GitHubAPIError,
  GitHubAPIResponse,
  GitHubAPISuccess,
  Repository,
  PullRequest,
  Commit,
  CodeSearchResultItem,
  RepoSearchResultItem,
  CommitSearchResultItem,
  SearchCodeParameters,
  SearchCodeResponse,
  SearchReposParameters,
  SearchReposResponse,
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
  SortOrder,
  SearchCodeSort,
  SearchReposSort,
  SearchCommitsSort,
  PullRequestState,
  RepositoryVisibility,
  ContentType,
  isGitHubAPIError,
  isGitHubAPISuccess,
  isRepository,
  isSearchResultItem,
} from './github-openapi';

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
