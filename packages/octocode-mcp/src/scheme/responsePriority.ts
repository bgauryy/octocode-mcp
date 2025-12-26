/**
 * Response key priority ordering for YAML formatting
 *
 * This defines the order in which keys appear in YAML responses for optimal LLM readability.
 * Keys are ordered by importance: context → structure → data → pagination → status → hints
 */

export const RESPONSE_KEY_PRIORITY = [
  // Context fields - most important for LLM understanding
  'researchGoal',
  'reasoning',
  // Instructions and response structure (bulk operations)
  'instructions',
  'results',
  'summary',
  // Individual result structure
  'status',
  'path',
  // Data fields
  'files',
  'matches',
  'content',
  'structuredOutput',
  'totalMatches',
  'totalFiles',
  'totalDirectories',
  'totalSize',
  'totalLines',
  'contentLength',
  // Pagination fields
  'pagination',
  'charPagination',
  'currentPage',
  'totalPages',
  'hasMore',
  'charOffset',
  'charLength',
  'totalChars',
  'filesPerPage',
  'entriesPerPage',
  'matchesPerPage',
  // Status fields
  'isPartial',
  'minificationFailed',
  'warnings',
  'error',
  'errorCode',
  // Full data payload (for bulk operations)
  'data',
  // Status hints - supplementary information
  'hints',
  'hasResultsStatusHints',
  'emptyStatusHints',
  'errorStatusHints',
];
