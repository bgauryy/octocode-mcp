/**
 * Public API — Tool execution functions and security validation.
 */

// --- GitHub Tools ---
export {
  fetchMultipleGitHubFileContents,
  type FileContentQuery,
  type ContentResultData,
  type ContentResult,
} from '../tools/github_fetch_content/index.js';

export {
  searchMultipleGitHubCode,
  type GitHubCodeSearchQuery,
  type SearchResult,
} from '../tools/github_search_code/index.js';

export {
  searchMultipleGitHubPullRequests,
  type GitHubPullRequestSearchQuery,
  type PullRequestInfo,
  type PRSearchPagination,
  type PullRequestSearchResultData,
  type PullRequestSearchResult,
} from '../tools/github_search_pull_requests/index.js';

export {
  searchMultipleGitHubRepos,
  type GitHubReposSearchQuery,
  type SimplifiedRepository,
  type RepoSearchResult,
} from '../tools/github_search_repos/index.js';

export {
  exploreMultipleRepositoryStructures,
  type GitHubViewRepoStructureQuery,
  type DirectoryEntry,
  type RepoStructureResultData,
  type RepoStructureResult,
} from '../tools/github_view_repo_structure/index.js';

// --- Local Tools ---
export {
  registerLocalFetchContentTool,
  fetchContent,
  executeFetchContent,
  type FetchContentQuery,
  type FetchContentPagination,
  type FetchContentResult,
} from '../tools/local_fetch_content/index.js';

export {
  registerLocalFindFilesTool,
  findFiles,
  executeFindFiles,
  type FindFilesQuery,
  type FoundFile,
  type FindFilesPagination,
  type FindFilesResult,
} from '../tools/local_find_files/index.js';

export {
  registerLocalRipgrepTool,
  searchContentRipgrep,
  executeRipgrepSearch,
  type RipgrepSearchQuery,
  type RipgrepMatch,
  type RipgrepMatchPagination,
  type RipgrepFileMatches,
  type SearchContentPagination,
  type SearchStats,
  type SearchContentResult,
} from '../tools/local_ripgrep/index.js';

export {
  registerLocalViewStructureTool,
  viewStructure,
  executeViewStructure,
  type ViewStructureQuery,
  type ViewStructurePagination,
  type ViewStructureResult,
} from '../tools/local_view_structure/index.js';

// --- LSP Tools ---
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
} from '../tools/lsp_call_hierarchy/index.js';

export {
  registerLSPFindReferencesTool,
  executeFindReferences,
  findReferences,
  findReferencesWithLSP,
  findReferencesWithPatternMatching,
  type LSPFindReferencesQuery,
  type ReferenceLocation,
  type FindReferencesResult,
} from '../tools/lsp_find_references/index.js';

export {
  executeGotoDefinition,
  type LSPGotoDefinitionQuery,
  type GotoDefinitionResult,
} from '../tools/lsp_goto_definition/index.js';

export type {
  ExactPosition,
  LSPRange,
  SymbolKind,
  CodeSnippet,
  LSPErrorType,
} from '../tools/lsp_goto_definition/types.js';

export type { LSPPaginationInfo } from '../tools/lsp_find_references/types.js';

// --- Package Search ---
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
} from '../tools/package_search/index.js';

// --- Security Validation ---
export { withBasicSecurityValidation } from '../security/withSecurityValidation.js';
