/**
 * Public API — Zod schemas for tool input validation.
 * All schemas are now centralized in @octocodeai/octocode-core.
 */

// --- GitHub Tool Schemas (Single Query) ---
export { GitHubCodeSearchQuerySchema } from '@octocodeai/octocode-core';
export { GitHubViewRepoStructureQuerySchema } from '@octocodeai/octocode-core';
export { GitHubReposSearchSingleQuerySchema } from '@octocodeai/octocode-core';
export { GitHubPullRequestSearchQuerySchema } from '@octocodeai/octocode-core';
export { FileContentQuerySchema } from '@octocodeai/octocode-core';

// --- GitHub Tool Schemas (Bulk Query) ---
export { GitHubCodeSearchBulkQuerySchema } from '@octocodeai/octocode-core';
export { GitHubViewRepoStructureBulkQuerySchema } from '@octocodeai/octocode-core';
export { GitHubReposSearchQuerySchema } from '@octocodeai/octocode-core';
export { GitHubPullRequestSearchBulkQuerySchema } from '@octocodeai/octocode-core';
export { FileContentBulkQuerySchema } from '@octocodeai/octocode-core';

// --- Local Tool Schemas (Single Query) ---
export { RipgrepQuerySchema } from '@octocodeai/octocode-core';
export { FetchContentQuerySchema } from '@octocodeai/octocode-core';
export { FindFilesQuerySchema } from '@octocodeai/octocode-core';
export { ViewStructureQuerySchema } from '@octocodeai/octocode-core';

// --- Local Tool Schemas (Bulk Query) ---
export { BulkRipgrepQuerySchema } from '@octocodeai/octocode-core';
export { BulkFetchContentSchema } from '@octocodeai/octocode-core';
export { BulkFindFilesSchema } from '@octocodeai/octocode-core';
export { BulkViewStructureSchema } from '@octocodeai/octocode-core';

// --- LSP Tool Schemas (Single Query) ---
export { LSPGotoDefinitionQuerySchema } from '@octocodeai/octocode-core';
export { LSPFindReferencesQuerySchema } from '@octocodeai/octocode-core';
export { LSPCallHierarchyQuerySchema } from '@octocodeai/octocode-core';

// --- LSP Tool Schemas (Bulk Query) ---
export { BulkLSPGotoDefinitionSchema } from '@octocodeai/octocode-core';
export { BulkLSPFindReferencesSchema } from '@octocodeai/octocode-core';
export { BulkLSPCallHierarchySchema } from '@octocodeai/octocode-core';

// --- Package Search Schemas ---
export {
  PackageSearchQuerySchema,
  NpmPackageQuerySchema,
  PythonPackageQuerySchema,
  PackageSearchBulkQuerySchema,
} from '@octocodeai/octocode-core';

// --- Base Schemas & Schema Utilities ---
export {
  BaseQuerySchema,
  BaseQuerySchemaLocal,
  createBulkQuerySchema,
} from '@octocodeai/octocode-core';
