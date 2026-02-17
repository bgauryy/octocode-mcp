/**
 * Pagination utilities module
 *
 * Consolidates all pagination-related utilities:
 * - Core pagination logic (applyPagination)
 * - Hint generation (generic, GitHub file content, structure)
 * - Type definitions
 */

// Re-export types
export type { PaginationMetadata } from './types.js';

// Re-export core utilities
export {
  applyPagination,
  serializeForPagination,
  createPaginationInfo,
} from './core.js';

// Re-export hint generators
export {
  generatePaginationHints,
  generateGitHubPaginationHints,
  generateStructurePaginationHints,
} from './hints.js';

// Re-export output size limit utility
export {
  applyOutputSizeLimit,
  type OutputSizeLimitOptions,
  type OutputSizeLimitResult,
} from './outputSizeLimit.js';
