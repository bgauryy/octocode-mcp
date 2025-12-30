/**
 * Shared types for the unified hints system
 * @module hints/types
 */

/**
 * Context that tools can provide to generate smarter hints
 * Used by both dynamic hint generators and the unified getHints() function
 */
export interface HintContext {
  // Size context
  fileSize?: number; // KB
  resultSize?: number; // chars
  tokenEstimate?: number; // estimated tokens
  entryCount?: number; // number of entries/files

  // Search context
  matchCount?: number; // number of matches
  fileCount?: number; // number of files
  isLarge?: boolean; // is result/file large?

  // Error context
  errorType?: 'size_limit' | 'not_found' | 'permission' | 'pattern_too_broad';
  originalError?: string;

  // Tool-specific context
  hasPattern?: boolean; // has matchString/pattern
  hasPagination?: boolean; // has charLength/pagination
  path?: string; // path being searched
  hasOwnerRepo?: boolean; // has owner/repo context
  match?: 'file' | 'path'; // GitHub code search match mode
  searchEngine?: 'rg' | 'grep'; // which search engine was used
}

/**
 * Status types for hint generation
 * - 'hasResults': Tool returned results
 * - 'empty': Tool returned no results
 * - 'error': Tool encountered an error
 */
export type HintStatus = 'hasResults' | 'empty' | 'error';

/**
 * Hint generator function signature for dynamic hints
 */
export type HintGenerator = (context: HintContext) => (string | undefined)[];

/**
 * Structure for tool-specific hint generators
 */
export interface ToolHintGenerators {
  hasResults: HintGenerator;
  empty: HintGenerator;
  error: HintGenerator;
}
