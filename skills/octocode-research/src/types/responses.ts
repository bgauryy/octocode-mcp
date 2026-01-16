/**
 * Response types for MCP tool results.
 * Use these instead of Record<string, unknown> for type-safe data handling.
 *
 * @module types/responses
 */

import { hasProperty, hasArrayProperty } from './guards.js';

// =============================================================================
// File and Search Types
// =============================================================================

/**
 * A match within a file
 */
export interface MatchLocation {
  line: number;
  column?: number;
  value?: string;
  byteOffset?: number;
  charOffset?: number;
}

/**
 * A file with matches from search results
 */
export interface FileMatch {
  path: string;
  line?: number;
  column?: number;
  matchText?: string;
  matchCount?: number;
  contextBefore?: string[];
  contextAfter?: string[];
  allMatches?: MatchLocation[];
}

/**
 * Pagination info for paginated results
 */
export interface PaginationInfo {
  page?: number;
  currentPage?: number;
  totalPages?: number;
  totalMatches?: number;
  totalFiles?: number;
  hasMore?: boolean;
  nextCursor?: string;
}

/**
 * Search result from localSearchCode or githubSearchCode
 */
interface SearchResult {
  files?: FileMatch[];
  totalMatches?: number;
  totalFiles?: number;
  pagination?: PaginationInfo;
}

// =============================================================================
// LSP Types
// =============================================================================

/**
 * LSP position
 */
interface LspPosition {
  line: number;
  character: number;
}

/**
 * LSP range
 */
interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/**
 * LSP definition location
 */
interface LspDefinition {
  uri: string;
  range: LspRange;
}

/**
 * LSP reference location
 */
export interface LspReference extends LspDefinition {
  context?: string;
}

/**
 * LSP call hierarchy item
 */
export interface LspCallHierarchyItem {
  name: string;
  kind?: number;
  uri: string;
  range?: LspRange;
  selectionRange?: LspRange;
}

// =============================================================================
// Repository Structure Types
// =============================================================================

/**
 * Repository structure result
 */
export interface RepoStructure {
  files?: string[];
  folders?: string[];
  totalFiles?: number;
  totalDirectories?: number;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an object is a FileMatch
 */
function isFileMatch(obj: unknown): obj is FileMatch {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'path' in obj &&
    typeof (obj as FileMatch).path === 'string'
  );
}

/**
 * Check if an object has valid pagination info
 */
function hasValidPagination(obj: unknown): obj is { pagination: PaginationInfo } {
  if (!hasProperty(obj, 'pagination')) return false;
  const p = obj.pagination;
  return typeof p === 'object' && p !== null;
}

/**
 * Check if an object is a SearchResult
 */
export function isSearchResult(obj: unknown): obj is SearchResult {
  if (typeof obj !== 'object' || obj === null) return false;
  if (hasArrayProperty(obj, 'files')) {
    const files = (obj as { files: unknown[] }).files;
    return files.every(isFileMatch);
  }
  return hasProperty(obj, 'totalMatches') || hasProperty(obj, 'totalFiles');
}

/**
 * Check if an object is an LspDefinition
 */
export function isLspDefinition(obj: unknown): obj is LspDefinition {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'uri' in obj &&
    'range' in obj &&
    typeof (obj as LspDefinition).uri === 'string'
  );
}

/**
 * Extract files array from data safely
 */
export function extractFiles(data: unknown): FileMatch[] {
  if (!hasArrayProperty(data, 'files')) return [];
  return (data as { files: unknown[] }).files.filter(isFileMatch);
}

/**
 * Extract pagination from data safely
 */
export function extractPagination(data: unknown): PaginationInfo | undefined {
  if (!hasValidPagination(data)) return undefined;
  return data.pagination;
}

/**
 * Extract total matches from data safely
 */
export function extractTotalMatches(data: unknown): number {
  if (hasProperty(data, 'totalMatches') && typeof data.totalMatches === 'number') {
    return data.totalMatches;
  }
  if (hasValidPagination(data) && typeof data.pagination.totalMatches === 'number') {
    return data.pagination.totalMatches;
  }
  return 0;
}
