/**
 * GitLab API Module
 *
 * Exports all GitLab API functions and types.
 *
 * @module gitlab
 */

// Client
export {
  getGitlab,
  isGitLabConfigured,
  getConfiguredGitLabHost,
  clearGitLabClients,
  clearGitLabClient,
  type GitLabClient,
} from './client.js';

// Types
export type {
  GitLabAPIError,
  GitLabAPISuccess,
  GitLabAPIResponse,
  GitLabProject,
  GitLabCodeSearchQuery,
  GitLabCodeSearchResult,
  GitLabCodeSearchItem,
  GitLabFileContentQuery,
  GitLabFileContent,
  GitLabMergeRequestQuery,
  GitLabMergeRequest,
  GitLabMRNote,
  GitLabTreeQuery,
  GitLabTreeItem,
  GitLabProjectsSearchQuery,
} from './types.js';

export { isGitLabAPIError, isGitLabAPISuccess } from './types.js';

// Errors
export {
  handleGitLabAPIError,
  createGitLabError,
  isRateLimitError,
  getRateLimitRetryDelay,
  GITLAB_ERROR_CODES,
} from './errors.js';

// Code Search
export {
  searchGitLabCodeAPI,
  transformGitLabCodeSearchItem,
} from './codeSearch.js';

// File Content
export {
  fetchGitLabFileContentAPI,
  getGitLabDefaultBranch,
  gitLabFileExists,
  transformGitLabFileContent,
} from './fileContent.js';

// Projects Search
export {
  searchGitLabProjectsAPI,
  getGitLabProject,
  transformGitLabProject,
  type GitLabProjectsSearchResult,
} from './projectsSearch.js';

// Merge Requests
export {
  searchGitLabMergeRequestsAPI,
  getGitLabMRNotes,
  getGitLabMRChanges,
  transformGitLabMergeRequest,
  type GitLabMRSearchResult,
} from './mergeRequests.js';

// Repository Structure
export {
  viewGitLabRepositoryStructureAPI,
  transformGitLabTree,
  type GitLabRepoStructureResult,
} from './repoStructure.js';
