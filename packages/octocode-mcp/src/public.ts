/**
 * Public API exports for octocode-mcp
 *
 * This module provides types, schemas, and utilities for users
 * who want to programmatically interact with Octocode MCP metadata.
 *
 * @example
 * ```typescript
 * import {
 *   STATIC_TOOL_NAMES,
 *   type CompleteMetadata,
 *   type ToolNames,
 *   type ToolMetadata
 * } from 'octocode-mcp/public';
 * ```
 */

// ============================================================================
// Types - Core metadata types for Octocode MCP
// ============================================================================

export type {
  CompleteMetadata,
  RawCompleteMetadata,
  ToolMetadata,
  ToolNames,
  BaseSchema,
  PromptMetadata,
  PromptArgument,
  HintStatus,
  HintContext,
  HintGenerator,
  ToolHintGenerators,
} from './types/metadata.js';

// ============================================================================
// Tool Names - Constants for all available tools
// ============================================================================

/**
 * Static tool name constants for all Octocode MCP tools.
 * Use these for type-safe tool name references.
 *
 * @example
 * ```typescript
 * const toolName = STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE;
 * // toolName = 'githubSearchCode'
 * ```
 */
export { STATIC_TOOL_NAMES } from './tools/toolNames.js';

// ============================================================================
// Tool Metadata Utilities - For accessing dynamic metadata
// ============================================================================

export {
  initializeToolMetadata,
  loadToolContent,
  TOOL_NAMES,
  BASE_SCHEMA,
  DESCRIPTIONS,
  TOOL_HINTS,
  GENERIC_ERROR_HINTS,
  GITHUB_FETCH_CONTENT,
  GITHUB_SEARCH_CODE,
  GITHUB_SEARCH_REPOS,
  GITHUB_SEARCH_PULL_REQUESTS,
  GITHUB_VIEW_REPO_STRUCTURE,
  PACKAGE_SEARCH,
  LOCAL_RIPGREP,
  LOCAL_FETCH_CONTENT,
  LOCAL_FIND_FILES,
  LOCAL_VIEW_STRUCTURE,
  isToolInMetadata,
  getToolHintsSync,
  getGenericErrorHintsSync,
  getDynamicHints,
} from './tools/toolMetadata.js';

// Re-export the ToolName type alias
export type { ToolName } from './tools/toolMetadata.js';

// ============================================================================
// Server Registration - For building custom MCP servers
// ============================================================================

/**
 * Register all tools from the tool registry.
 * Use this to programmatically register Octocode tools with an MCP server.
 *
 * @example
 * ```typescript
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 * import { registerTools } from 'octocode-mcp/public';
 *
 * const server = new McpServer(...);
 * const { successCount, failedTools } = await registerTools(server);
 * ```
 */
export { registerTools } from './tools/toolsManager.js';

/**
 * Register all prompts with an MCP server.
 * Use this to programmatically register Octocode prompts.
 *
 * @example
 * ```typescript
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 * import { registerPrompts, loadToolContent } from 'octocode-mcp/public';
 *
 * const server = new McpServer(...);
 * const content = await loadToolContent();
 * registerPrompts(server, content);
 * ```
 */
export { registerPrompts } from './prompts/prompts.js';

// ============================================================================
// Tool Configuration - For tool filtering and configuration
// ============================================================================

export { ALL_TOOLS, type ToolConfig } from './tools/toolConfig.js';

// ============================================================================
// Server Configuration - For accessing runtime configuration
// ============================================================================

/**
 * Get the source of the current GitHub token.
 * Always resolves fresh - token can change at runtime.
 * Useful for debugging and logging token resolution.
 *
 * @example
 * ```typescript
 * import { getTokenSource } from 'octocode-mcp/public';
 *
 * const source = await getTokenSource();
 * console.log(`Token from: ${source}`);
 * // Output: 'env:GH_TOKEN', 'gh-cli', 'octocode-storage', or 'none'
 * ```
 */
export { getTokenSource } from './serverConfig.js';

// Re-export TokenSourceType for type-safe usage
export type { TokenSourceType } from './types.js';

// ============================================================================
// Tool Execution Functions & Types - For direct programmatic use
// ============================================================================

// --- GitHub Tools ---

/**
 * GitHub File Content - Fetch file content from GitHub repositories
 * @example
 * ```typescript
 * import { fetchMultipleGitHubFileContents, type FileContentQuery } from 'octocode-mcp/public';
 * const result = await fetchMultipleGitHubFileContents([{ owner: 'org', repo: 'repo', path: 'src/index.ts' }]);
 * ```
 */
export {
  fetchMultipleGitHubFileContents,
  type FileContentQuery,
  type SamplingInfo,
  type ContentResultData,
  type ContentResult,
} from './tools/github_fetch_content/index.js';

/**
 * GitHub Code Search - Search code across GitHub repositories
 * @example
 * ```typescript
 * import { searchMultipleGitHubCode, type GitHubCodeSearchQuery } from 'octocode-mcp/public';
 * const result = await searchMultipleGitHubCode([{ keywordsToSearch: ['useState'], owner: 'facebook', repo: 'react' }]);
 * ```
 */
export {
  searchMultipleGitHubCode,
  type GitHubCodeSearchQuery,
  type SearchResult,
} from './tools/github_search_code/index.js';

/**
 * GitHub Pull Request Search - Search and analyze pull requests
 * @example
 * ```typescript
 * import { searchMultipleGitHubPullRequests, type GitHubPullRequestSearchQuery } from 'octocode-mcp/public';
 * const result = await searchMultipleGitHubPullRequests([{ owner: 'org', repo: 'repo', state: 'closed', merged: true }]);
 * ```
 */
export {
  searchMultipleGitHubPullRequests,
  type GitHubPullRequestSearchQuery,
  type PullRequestInfo,
  type PRSearchPagination,
  type PullRequestSearchResultData,
  type PullRequestSearchResult,
} from './tools/github_search_pull_requests/index.js';

/**
 * GitHub Repository Search - Search GitHub repositories
 * @example
 * ```typescript
 * import { searchMultipleGitHubRepos, type GitHubReposSearchQuery } from 'octocode-mcp/public';
 * const result = await searchMultipleGitHubRepos([{ topicsToSearch: ['typescript', 'cli'], stars: '>1000' }]);
 * ```
 */
export {
  searchMultipleGitHubRepos,
  type GitHubReposSearchQuery,
  type SimplifiedRepository,
  type RepoSearchResult,
} from './tools/github_search_repos/index.js';

/**
 * GitHub Repository Structure - Browse repository tree structure
 * @example
 * ```typescript
 * import { exploreMultipleRepositoryStructures, type GitHubViewRepoStructureQuery } from 'octocode-mcp/public';
 * const result = await exploreMultipleRepositoryStructures([{ owner: 'org', repo: 'repo', branch: 'main', path: 'src' }]);
 * ```
 */
export {
  exploreMultipleRepositoryStructures,
  type GitHubViewRepoStructureQuery,
  type DirectoryEntry,
  type RepoStructureResultData,
  type RepoStructureResult,
} from './tools/github_view_repo_structure/index.js';

// --- Local Tools ---

/**
 * Local File Content - Read local file content with various extraction modes
 * @example
 * ```typescript
 * import { fetchContent, executeFetchContent, type FetchContentQuery } from 'octocode-mcp/public';
 * const result = await fetchContent({ path: '/path/to/file.ts', matchString: 'export function' });
 * ```
 */
export {
  registerLocalFetchContentTool,
  fetchContent,
  executeFetchContent,
  type FetchContentQuery,
  type FetchContentPagination,
  type FetchContentResult,
} from './tools/local_fetch_content/index.js';

/**
 * Local Find Files - Find files by name, type, and metadata
 * @example
 * ```typescript
 * import { findFiles, executeFindFiles, type FindFilesQuery } from 'octocode-mcp/public';
 * const result = await findFiles({ path: '/project', name: '*.ts', modifiedWithin: '7d' });
 * ```
 */
export {
  registerLocalFindFilesTool,
  findFiles,
  executeFindFiles,
  type FindFilesQuery,
  type FoundFile,
  type FindFilesPagination,
  type FindFilesResult,
} from './tools/local_find_files/index.js';

/**
 * Local Code Search (Ripgrep) - Search code content with ripgrep
 * @example
 * ```typescript
 * import { searchContentRipgrep, executeRipgrepSearch, type RipgrepSearchQuery } from 'octocode-mcp/public';
 * const result = await searchContentRipgrep({ pattern: 'export async function', path: '/project/src' });
 * ```
 */
export {
  registerLocalRipgrepTool,
  searchContentRipgrep,
  executeRipgrepSearch,
  type RipgrepSearchQuery,
  type RipgrepMatchLocation,
  type RipgrepMatch,
  type RipgrepMatchPagination,
  type RipgrepFileMatches,
  type SearchContentPagination,
  type SearchStats,
  type SearchContentResult,
} from './tools/local_ripgrep/index.js';

/**
 * Local View Structure - Browse local directory structure
 * @example
 * ```typescript
 * import { viewStructure, executeViewStructure, type ViewStructureQuery } from 'octocode-mcp/public';
 * const result = await viewStructure({ path: '/project', depth: 2, filesOnly: true });
 * ```
 */
export {
  registerLocalViewStructureTool,
  viewStructure,
  executeViewStructure,
  type ViewStructureQuery,
  type ViewStructurePagination,
  type ViewStructureResult,
} from './tools/local_view_structure/index.js';

// --- LSP Tools ---

/**
 * LSP Call Hierarchy - Trace function call relationships
 * @example
 * ```typescript
 * import { executeCallHierarchy, processCallHierarchy, type LSPCallHierarchyQuery } from 'octocode-mcp/public';
 * const result = await executeCallHierarchy({ queries: [{ uri: 'file:///path/to/file.ts', symbolName: 'myFunc', lineHint: 10, direction: 'incoming' }] });
 * ```
 */
export {
  registerLSPCallHierarchyTool,
  executeCallHierarchy,
  processCallHierarchy,
  parseRipgrepJsonOutput,
  parseGrepOutput,
  extractFunctionBody,
  inferSymbolKind,
  createRange,
  escapeRegex,
  type LSPCallHierarchyQuery,
  type CallHierarchyItem,
  type IncomingCall,
  type OutgoingCall,
  type CallHierarchyResult,
} from './tools/lsp_call_hierarchy/index.js';

/**
 * LSP Find References - Find all usages of a symbol
 * @example
 * ```typescript
 * import { executeFindReferences, findReferences, type LSPFindReferencesQuery } from 'octocode-mcp/public';
 * const result = await executeFindReferences({ queries: [{ uri: 'file:///path/to/file.ts', symbolName: 'MyType', lineHint: 5 }] });
 * ```
 */
export {
  registerLSPFindReferencesTool,
  executeFindReferences,
  findReferences,
  findReferencesWithLSP,
  findReferencesWithPatternMatching,
  type LSPFindReferencesQuery,
  type ReferenceLocation,
  type FindReferencesResult,
} from './tools/lsp_find_references/index.js';

/**
 * LSP Goto Definition - Jump to symbol definition
 * @example
 * ```typescript
 * import { executeGotoDefinition, type LSPGotoDefinitionQuery } from 'octocode-mcp/public';
 * const result = await executeGotoDefinition({ queries: [{ uri: 'file:///path/to/file.ts', symbolName: 'myFunc', lineHint: 10 }] });
 * ```
 */
export {
  executeGotoDefinition,
  type LSPGotoDefinitionQuery,
  type GotoDefinitionResult,
} from './tools/lsp_goto_definition/index.js';

// --- Shared LSP Types (re-exported for convenience) ---
export type {
  ExactPosition,
  LSPRange,
  SymbolKind,
  CodeSnippet,
  LSPErrorType,
} from './tools/lsp_goto_definition/types.js';

export type { LSPPaginationInfo } from './tools/lsp_find_references/types.js';

// --- Package Search ---

/**
 * Package Search - Search NPM and PyPI packages
 * @example
 * ```typescript
 * import { searchPackages, type PackageSearchQuery } from 'octocode-mcp/public';
 * const result = await searchPackages([{ name: 'lodash', ecosystem: 'npm' }]);
 * ```
 */
export {
  searchPackages,
  type NpmPackageSearchQuery,
  type PythonPackageSearchQuery,
  type PackageSearchQuery,
  type MinimalPackageResult,
  type NpmPackageResult,
  type PythonPackageResult,
  type PackageResult,
  type PackageResultWithRepo,
  type DeprecationInfo,
  type PackageSearchAPIResult,
  type PackageSearchError,
  type PackageSearchResult,
} from './tools/package_search/index.js';
