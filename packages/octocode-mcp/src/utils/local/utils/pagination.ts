/**
 * Pagination utilities - re-export from consolidated module
 *
 * @deprecated Import from '../../../utils/pagination/index.js' instead
 *
 * This file is maintained for backward compatibility.
 * All pagination utilities have been consolidated into utils/pagination/
 */

export {
  // Types
  type PaginationMetadata,
  type ApplyPaginationOptions,
  type GeneratePaginationHintsOptions,
  type SliceByCharResult,
  // Core utilities
  applyPagination,
  serializeForPagination,
  sliceByCharRespectLines,
  createPaginationInfo,
  // Hint generators
  generatePaginationHints,
} from '../../../utils/pagination/index.js';
