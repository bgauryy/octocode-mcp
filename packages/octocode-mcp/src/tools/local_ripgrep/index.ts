// Registration
export { registerLocalRipgrepTool } from './register.js';

// Execution functions
export { searchContentRipgrep } from './searchContentRipgrep.js';
export { executeRipgrepSearch } from './execution.js';

// Types
export type {
  RipgrepSearchQuery,
  RipgrepMatch,
  RipgrepMatchPagination,
  RipgrepFileMatches,
  SearchContentPagination,
  SearchStats,
  SearchContentResult,
} from './types.js';
