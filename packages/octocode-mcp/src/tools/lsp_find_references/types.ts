/**
 * Types for lsp_find_references tool (lspFindReferences)
 * @module tools/lsp_find_references/types
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for LSP find references
 */
export interface LSPFindReferencesQuery {
  uri: string;
  symbolName: string;
  lineHint: number;
  orderHint?: number;
  contextLines?: number;
  includeDeclaration?: boolean;
  page?: number;
  referencesPerPage?: number;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// SHARED LSP TYPES
// ============================================================================

/**
 * Exact position in a file (0-indexed for LSP compatibility)
 */
export interface ExactPosition {
  line: number;
  character: number;
}

/**
 * Range in a file (0-indexed)
 */
export interface LSPRange {
  start: ExactPosition;
  end: ExactPosition;
}

/**
 * Symbol kinds for LSP
 */
export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'property'
  | 'enum'
  | 'module'
  | 'namespace'
  | 'unknown';

/**
 * Code snippet with location information
 */
export interface CodeSnippet {
  uri: string;
  range: LSPRange;
  content: string;
  symbolKind?: SymbolKind;
  displayRange?: {
    startLine: number;
    endLine: number;
  };
}

/**
 * Reference location with context
 */
export interface ReferenceLocation extends CodeSnippet {
  isDefinition?: boolean;
}

/**
 * Pagination info for LSP results
 */
export interface LSPPaginationInfo {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  hasMore: boolean;
  resultsPerPage: number;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * LSP error types
 */
export type LSPErrorType =
  | 'symbol_not_found'
  | 'file_not_found'
  | 'not_a_function'
  | 'timeout'
  | 'parse_error'
  | 'unknown';

/**
 * Result of LSP find references
 */
export interface FindReferencesResult {
  status: 'hasResults' | 'empty' | 'error';
  error?: string;
  errorType?: LSPErrorType;
  hints?: string[];
  researchGoal?: string;
  reasoning?: string;
  locations?: ReferenceLocation[];
  pagination?: LSPPaginationInfo;
  totalReferences?: number;
  hasMultipleFiles?: boolean;
  [key: string]: unknown;
}
