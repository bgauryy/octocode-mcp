/**
 * Octocode Research Skill
 *
 * Re-exports all octocode tools with skill-friendly names.
 * Each tool can be called as a function with query arrays.
 *
 * @example
 * ```typescript
 * import { githubSearchCode, localSearchCode, lspGotoDefinition } from 'octocode-research';
 *
 * // Search GitHub code
 * const result = await githubSearchCode({
 *   queries: [{
 *     mainResearchGoal: "Find React hooks",
 *     researchGoal: "Locate useState implementation",
 *     reasoning: "Understanding state management",
 *     keywordsToSearch: ["useState"],
 *     owner: "facebook",
 *     repo: "react"
 *   }]
 * });
 * ```
 */

// ============================================================================
// GitHub Tools (Remote Repository Research)
// ============================================================================

export {
  fetchMultipleGitHubFileContents as githubGetFileContent,
  searchMultipleGitHubCode as githubSearchCode,
  searchMultipleGitHubPullRequests as githubSearchPullRequests,
  searchMultipleGitHubRepos as githubSearchRepositories,
  exploreMultipleRepositoryStructures as githubViewRepoStructure,
} from 'octocode-mcp/public';

// GitHub Types
export type {
  FileContentQuery,
  ContentResult,
  GitHubCodeSearchQuery,
  SearchResult,
  GitHubPullRequestSearchQuery,
  PullRequestSearchResult,
  GitHubReposSearchQuery,
  RepoSearchResult,
  GitHubViewRepoStructureQuery,
  RepoStructureResult,
} from 'octocode-mcp/public';

// ============================================================================
// Local Tools (Local Codebase Research)
// ============================================================================

export {
  executeFetchContent as localGetFileContent,
  executeFindFiles as localFindFiles,
  executeRipgrepSearch as localSearchCode,
  executeViewStructure as localViewStructure,
} from 'octocode-mcp/public';

// Local Types
export type {
  FetchContentQuery,
  FetchContentResult,
  FindFilesQuery,
  FindFilesResult,
  RipgrepSearchQuery,
  SearchContentResult,
  ViewStructureQuery,
  ViewStructureResult,
} from 'octocode-mcp/public';

// ============================================================================
// LSP Tools (Semantic Code Analysis)
// ============================================================================

export {
  executeGotoDefinition as lspGotoDefinition,
  executeFindReferences as lspFindReferences,
  executeCallHierarchy as lspCallHierarchy,
} from 'octocode-mcp/public';

// LSP Types
export type {
  LSPGotoDefinitionQuery,
  GotoDefinitionResult,
  LSPFindReferencesQuery,
  FindReferencesResult,
  LSPCallHierarchyQuery,
  CallHierarchyResult,
} from 'octocode-mcp/public';

// ============================================================================
// Package Search Tools
// ============================================================================

export { searchPackages as packageSearch } from 'octocode-mcp/public';

// Package Types
export type {
  PackageSearchQuery,
  PackageSearchResult,
  NpmPackageSearchQuery,
  PythonPackageSearchQuery,
} from 'octocode-mcp/public';

// ============================================================================
// Response Utilities (for custom result formatting)
// ============================================================================

// Legacy API (backwards compatible)
export { createResult, createResponseFormat } from 'octocode-mcp/responses';

// New Role-Based Response API
export {
  createRoleBasedResult,
  ContentBuilder,
  QuickResult,
  StatusEmoji,
  StatusEmojis,
} from 'octocode-mcp/responses';

export type {
  ContentRole,
  RoleContentBlock,
  RoleBasedResultOptions,
  RoleAnnotations,
} from 'octocode-mcp/responses';

// Research-specific response builders
export { ResearchResponse } from './utils/responseBuilder.js';

// ============================================================================
// Tool Metadata & Configuration
// ============================================================================

export {
  TOOL_NAMES,
  DESCRIPTIONS,
  getToolHintsSync,
  getGenericErrorHintsSync,
} from 'octocode-mcp/public';

// ============================================================================
// Security Validation (for wrapping tool calls)
// ============================================================================

export { withBasicSecurityValidation } from 'octocode-mcp/public';

// ============================================================================
// Token Management (for GitHub API authentication)
// ============================================================================

export {
  initialize,
  initializeProviders,
  getGitHubToken,
  getToken,
  getTokenSource,
} from 'octocode-mcp/public';

export type { TokenSourceType } from 'octocode-mcp/public';
