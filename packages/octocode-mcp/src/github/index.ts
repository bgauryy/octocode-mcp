export {
  getOctokit,
  OctokitWithThrottling,
  clearOctokitInstances,
} from './client';
export { handleGitHubAPIError } from './errors';
import { clearConfigCachedToken } from '../serverConfig.js';
import { clearOctokitInstances } from './client.js';

/**
 * Unified function to clear all authentication state.
 * Clears both the config cached token and Octokit instances.
 */
export function clearAllAuthState(): void {
  clearOctokitInstances();
  clearConfigCachedToken();
}

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
