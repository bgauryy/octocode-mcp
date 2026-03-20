export { fetchMultipleGitHubFileContents } from '../tools/github_fetch_content/execution.js';
export type {
  FileContentQuery,
  ContentResultData,
  ContentResult,
} from '../tools/github_fetch_content/types.js';

export { searchMultipleGitHubCode } from '../tools/github_search_code/execution.js';
export type {
  GitHubCodeSearchQuery,
  SearchResult,
} from '../tools/github_search_code/types.js';

export { searchMultipleGitHubPullRequests } from '../tools/github_search_pull_requests/execution.js';
export type {
  GitHubPullRequestSearchQuery,
  PullRequestInfo,
  PRSearchPagination,
  PullRequestSearchResultData,
  PullRequestSearchResult,
} from '../tools/github_search_pull_requests/types.js';

export { searchMultipleGitHubRepos } from '../tools/github_search_repos/execution.js';
export type {
  GitHubReposSearchQuery,
  SimplifiedRepository,
  RepoSearchResult,
} from '../tools/github_search_repos/types.js';

export { exploreMultipleRepositoryStructures } from '../tools/github_view_repo_structure/execution.js';
export type {
  GitHubViewRepoStructureQuery,
  DirectoryEntry,
  RepoStructureResultData,
  RepoStructureResult,
} from '../tools/github_view_repo_structure/types.js';

// --- Local Tools ---
export { registerLocalFetchContentTool } from '../tools/local_fetch_content/register.js';
export { fetchContent } from '../tools/local_fetch_content/fetchContent.js';
export { executeFetchContent } from '../tools/local_fetch_content/execution.js';
export type {
  FetchContentQuery,
  FetchContentPagination,
  FetchContentResult,
} from '../tools/local_fetch_content/types.js';

export { registerLocalFindFilesTool } from '../tools/local_find_files/register.js';
export { findFiles } from '../tools/local_find_files/findFiles.js';
export { executeFindFiles } from '../tools/local_find_files/execution.js';
export type {
  FindFilesQuery,
  FoundFile,
  FindFilesPagination,
  FindFilesResult,
} from '../tools/local_find_files/types.js';

export { registerLocalRipgrepTool } from '../tools/local_ripgrep/register.js';
export { searchContentRipgrep } from '../tools/local_ripgrep/searchContentRipgrep.js';
export { executeRipgrepSearch } from '../tools/local_ripgrep/execution.js';
export type {
  RipgrepSearchQuery,
  RipgrepMatch,
  RipgrepMatchPagination,
  RipgrepFileMatches,
  SearchContentPagination,
  SearchStats,
  SearchContentResult,
} from '../tools/local_ripgrep/types.js';

export { registerLocalViewStructureTool } from '../tools/local_view_structure/register.js';
export { viewStructure } from '../tools/local_view_structure/local_view_structure.js';
export { executeViewStructure } from '../tools/local_view_structure/execution.js';
export type {
  ViewStructureQuery,
  ViewStructurePagination,
  ViewStructureResult,
} from '../tools/local_view_structure/types.js';

export { registerLSPCallHierarchyTool } from '../tools/lsp_call_hierarchy/register.js';
export { executeCallHierarchy } from '../tools/lsp_call_hierarchy/execution.js';
export {
  processCallHierarchy,
  parseRipgrepJsonOutput,
  parseGrepOutput,
  extractFunctionBody,
  inferSymbolKind,
  createRange,
  escapeRegex,
} from '../tools/lsp_call_hierarchy/callHierarchy.js';
export type {
  LSPCallHierarchyQuery,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  CallHierarchyResult,
} from '../tools/lsp_call_hierarchy/types.js';

export { registerLSPFindReferencesTool } from '../tools/lsp_find_references/register.js';
export { executeFindReferences } from '../tools/lsp_find_references/execution.js';
export {
  findReferences,
  findReferencesWithLSP,
  findReferencesWithPatternMatching,
} from '../tools/lsp_find_references/lsp_find_references.js';
export type {
  LSPFindReferencesQuery,
  ReferenceLocation,
  FindReferencesResult,
} from '../tools/lsp_find_references/types.js';

export { executeGotoDefinition } from '../tools/lsp_goto_definition/execution.js';
export type {
  LSPGotoDefinitionQuery,
  GotoDefinitionResult,
} from '../tools/lsp_goto_definition/types.js';

export type {
  ExactPosition,
  LSPRange,
  SymbolKind,
  CodeSnippet,
  LSPErrorType,
} from '../tools/lsp_goto_definition/types.js';

export type { LSPPaginationInfo } from '../tools/lsp_find_references/types.js';

export { searchPackages } from '../tools/package_search/execution.js';
export type {
  NpmPackageSearchQuery,
  PythonPackageSearchQuery,
  PackageSearchQuery,
  MinimalPackageResult,
  NpmPackageResult,
  PythonPackageResult,
  PackageResult,
  PackageResultWithRepo,
  DeprecationInfo,
  PackageSearchAPIResult,
  PackageSearchError,
  PackageSearchResult,
} from '../tools/package_search/types.js';

export { withBasicSecurityValidation } from '../security/withSecurityValidation.js';

export { registerGitHubCloneRepoTool } from '../tools/github_clone_repo/register.js';
