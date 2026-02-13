export {
  getOctokit,
  OctokitWithThrottling,
  clearOctokitInstances,
  resolveDefaultBranch,
} from './client';
export { handleGitHubAPIError } from './errors';

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
