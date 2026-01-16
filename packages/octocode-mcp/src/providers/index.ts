/**
 * Provider Abstraction Layer
 *
 * This module provides a unified interface for interacting with different
 * code hosting providers (GitHub, GitLab, etc.).
 *
 * ## Usage
 *
 * ### Using the Execution Layer (Recommended)
 *
 * The execution layer automatically routes requests to the appropriate provider
 * based on the `provider` parameter in queries:
 *
 * ```typescript
 * import {
 *   executeCodeSearch,
 *   executeGetFileContent,
 *   executeRepoSearch,
 *   executePullRequestSearch,
 *   executeGetRepoStructure,
 * } from './providers';
 *
 * // Search GitHub (default)
 * const githubResult = await executeCodeSearch({
 *   keywords: ['useState'],
 *   projectId: 'facebook/react',
 * });
 *
 * // Search GitLab
 * const gitlabResult = await executeCodeSearch({
 *   provider: 'gitlab',
 *   keywords: ['pipeline'],
 *   projectId: 'gitlab-org/gitlab',
 * });
 * ```
 *
 * ### Using Providers Directly
 *
 * For more control, you can use the provider factory directly:
 *
 * ```typescript
 * import { getProvider } from './providers';
 *
 * const github = getProvider('github');
 * const gitlab = getProvider('gitlab', { baseUrl: 'https://gitlab.mycompany.com' });
 *
 * const result = await github.searchCode({ ... });
 * ```
 *
 * @module providers
 */

// Types
export type {
  ProviderType,
  ProviderConfig,
  ICodeHostProvider,
  ProviderResponse,
  ExecutionOptions,
  // Query types
  BaseProviderQuery,
  CodeSearchQuery,
  FileContentQuery,
  RepoSearchQuery,
  PullRequestQuery,
  RepoStructureQuery,
  ProviderQuery,
  // Result types
  CodeSearchResult,
  CodeSearchItem,
  FileContentResult,
  RepoSearchResult,
  UnifiedRepository,
  PullRequestSearchResult,
  PullRequestItem,
  RepoStructureResult,
  DirectoryEntry,
} from './types.js';

export { isProviderSuccess, isProviderError } from './types.js';

// Factory
export {
  getProvider,
  registerProvider,
  isProviderRegistered,
  getRegisteredProviders,
  clearProviderCache,
  clearProviderInstance,
  initializeProviders,
  DEFAULT_PROVIDER,
  extractProviderFromQuery,
} from './factory.js';

// Execution Layer
export {
  executeCodeSearch,
  executeGetFileContent,
  executeRepoSearch,
  executePullRequestSearch,
  executeGetRepoStructure,
  createExecutionOptions,
  isValidProvider,
  getDefaultProvider,
  legacyToUnified,
  unifiedToLegacy,
} from './execute.js';

// Provider Implementations
export { GitHubProvider } from './github/index.js';
export { GitLabProvider } from './gitlab/index.js';
