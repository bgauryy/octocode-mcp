export { getOctokit, OctokitWithThrottling, clearCachedToken } from './client';
export { handleGitHubAPIError } from './errors';

export type {
  GitHubAPIError,
  GitHubAPIResponse,
  GitHubAPISuccess,
  Repository,
  OptimizedCodeSearchResult,
  GitHubPullRequestItem,
  GitHubPullRequestsSearchParams,
  GetContentParameters,
  GetRepoResponse,
  isGitHubAPIError,
  isGitHubAPISuccess,
  isRepository,
  // Octokit schema type aliases
  OctokitRateLimit,
  OctokitRateLimitOverview,
  OctokitSimpleUser,
  OctokitPublicUser,
  OctokitPrivateUser,
  OctokitCommit,
} from './githubAPI';

export type { components } from '@octokit/openapi-types';
export type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

export {
  buildCodeSearchQuery,
  buildRepoSearchQuery,
  buildPullRequestSearchQuery,
  shouldUseSearchForPRs,
} from './queryBuilders';

export { searchGitHubCodeAPI } from './codeSearch';
export { searchGitHubReposAPI } from './repoSearch';
export {
  searchGitHubPullRequestsAPI,
  fetchGitHubPullRequestByNumberAPI,
  transformPullRequestItemFromREST,
} from './pullRequestSearch';

export {
  fetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI,
} from './fileOperations';
