/**
 * Octocode Research Skill
 *
 * Re-exports octocode tools with skill-friendly names.
 * Only exports symbols that are actually consumed within this package.
 *
 * For types or additional utilities, import directly from 'octocode-mcp/public'.
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

// ============================================================================
// Local Tools (Local Codebase Research)
// ============================================================================

export {
  executeFetchContent as localGetFileContent,
  executeFindFiles as localFindFiles,
  executeRipgrepSearch as localSearchCode,
  executeViewStructure as localViewStructure,
} from 'octocode-mcp/public';

// ============================================================================
// LSP Tools (Semantic Code Analysis)
// ============================================================================

export {
  executeGotoDefinition as lspGotoDefinition,
  executeFindReferences as lspFindReferences,
  executeCallHierarchy as lspCallHierarchy,
} from 'octocode-mcp/public';

// ============================================================================
// Package Search Tools
// ============================================================================

export { searchPackages as packageSearch } from 'octocode-mcp/public';

// ============================================================================
// Token Management (for GitHub API authentication)
// ============================================================================

export { initializeProviders } from 'octocode-mcp/public';

// ============================================================================
// Session Management (for tracking usage and telemetry)
// ============================================================================

export {
  initializeSession,
  logSessionInit,
  logToolCall,
  logPromptCall,
  logSessionError,
  logRateLimit,
} from 'octocode-mcp/public';
