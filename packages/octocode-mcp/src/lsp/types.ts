/**
 * LSP (Language Server Protocol) types for octocode-mcp
 * Provides semantic code intelligence features
 * @module lsp/types
 */

/**
 * Fuzzy position for symbol resolution
 * Used when exact character position is not known
 */
export interface FuzzyPosition {
  /** EXACT symbol name to find (case-sensitive, no partial matches) */
  symbolName: string;
  /** 1-indexed line number hint (tool searches ±radius lines) */
  lineHint: number;
  /** 0-indexed occurrence if symbol appears multiple times on same line */
  orderHint?: number;
}

/**
 * Exact position in a file (0-indexed for LSP compatibility)
 */
export interface ExactPosition {
  /** 0-indexed line number */
  line: number;
  /** 0-indexed character position */
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
 * Code snippet with location information
 */
export interface CodeSnippet {
  /** File path (relative to workspace root) */
  uri: string;
  /** Range in the file */
  range: LSPRange;
  /** Code content */
  content: string;
  /** Symbol kind (function, class, variable, type, etc.) */
  symbolKind?: SymbolKind;
  /** 1-indexed line numbers for display */
  displayRange?: {
    startLine: number;
    endLine: number;
  };
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
 * Reference location with context
 */
export interface ReferenceLocation extends CodeSnippet {
  /** Whether this is the definition (vs a usage) */
  isDefinition?: boolean;
}

/**
 * Call hierarchy item
 */
export interface CallHierarchyItem {
  /** Function/method name */
  name: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** File containing the function */
  uri: string;
  /** Range of the function definition */
  range: LSPRange;
  /** Selection range (usually the function name) */
  selectionRange: LSPRange;
  /** Code content around the call site */
  content?: string;
  /** 1-indexed line numbers for display */
  displayRange?: {
    startLine: number;
    endLine: number;
  };
}

/**
 * Incoming call (who calls this function)
 */
export interface IncomingCall {
  /** The function that makes the call */
  from: CallHierarchyItem;
  /** Ranges where calls are made from 'from' to this function */
  fromRanges: LSPRange[];
}

/**
 * Outgoing call (what this function calls)
 */
export interface OutgoingCall {
  /** The function being called */
  to: CallHierarchyItem;
  /** Ranges where calls are made from this function to 'to' */
  fromRanges: LSPRange[];
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

/**
 * Base LSP tool result
 */
export interface LSPToolResultBase {
  /** Result status */
  status: 'hasResults' | 'empty' | 'error';
  /** Error message if status is 'error' */
  error?: string;
  /** Error type for hint generation */
  errorType?: LSPErrorType;
  /** Hints for next steps */
  hints?: string[];
  /** Research context passed through */
  researchGoal?: string;
  reasoning?: string;
  /** Index signature for ProcessedBulkResult compatibility */
  [key: string]: unknown;
}

/**
 * LSP error types for dynamic hints
 */
export type LSPErrorType =
  | 'symbol_not_found'
  | 'file_not_found'
  | 'not_a_function'
  | 'timeout'
  | 'parse_error'
  | 'unknown';

/**
 * Go to definition result
 */
export interface GotoDefinitionResult extends LSPToolResultBase {
  /** Definition locations (usually 1, but can be multiple for overloads) */
  locations?: CodeSnippet[];
  /** Resolved position where symbol was found */
  resolvedPosition?: ExactPosition;
  /** Search radius used */
  searchRadius?: number;
}

/**
 * Find references result
 */
export interface FindReferencesResult extends LSPToolResultBase {
  /** Reference locations */
  locations?: ReferenceLocation[];
  /** Pagination info */
  pagination?: LSPPaginationInfo;
  /** Total reference count (before pagination) */
  totalReferences?: number;
  /** Whether references span multiple files */
  hasMultipleFiles?: boolean;
}

/**
 * Call hierarchy result
 */
export interface CallHierarchyResult extends LSPToolResultBase {
  /** The target function for hierarchy */
  item?: CallHierarchyItem;
  /** Incoming calls (when direction='incoming') */
  incomingCalls?: IncomingCall[];
  /** Outgoing calls (when direction='outgoing') */
  outgoingCalls?: OutgoingCall[];
  /** Pagination info */
  pagination?: LSPPaginationInfo;
  /** Direction of the hierarchy search */
  direction?: 'incoming' | 'outgoing';
  /** Depth of the search */
  depth?: number;
}

/**
 * LSP hint context extending base HintContext
 */
export interface LSPHintContext {
  // Resolution info
  symbolFound?: boolean;
  resolvedLine?: number;
  searchRadius?: number;
  symbolName?: string;
  lineHint?: number;

  // Results info
  locationCount?: number;
  hasMultipleFiles?: boolean;
  hasExternalPackage?: boolean;

  // Call hierarchy specific
  direction?: 'incoming' | 'outgoing';
  depth?: number;
  callCount?: number;

  // Pagination
  hasMorePages?: boolean;
  currentPage?: number;
  totalPages?: number;

  // Error context
  errorType?: LSPErrorType;
}
