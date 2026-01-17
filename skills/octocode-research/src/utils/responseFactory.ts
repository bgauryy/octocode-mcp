/**
 * Response utilities for route handlers.
 * Provides type-safe extractors and helpers for processing MCP responses.
 *
 * @module utils/responseFactory
 */

import type { FileMatch, PaginationInfo } from '../types/responses.js';
import { extractFiles, extractPagination, extractTotalMatches } from '../types/responses.js';
import { isObject, hasProperty, isArray, hasStringProperty, hasNumberProperty } from '../types/guards.js';

// =============================================================================
// Common Extractors (Type-Safe)
// =============================================================================

/**
 * Extract file matches from search results with proper typing
 */
export function extractFileMatches(data: unknown): FileMatch[] {
  return extractFiles(data);
}

/**
 * Extract pagination info with proper typing
 */
export function extractPaginationInfo(data: unknown): PaginationInfo | undefined {
  return extractPagination(data);
}

/**
 * Extract total match count with proper typing
 */
export function extractMatchCount(data: unknown): number {
  return extractTotalMatches(data);
}

/**
 * Safely extract string property
 */
export function safeString(obj: unknown, key: string, fallback = ''): string {
  if (hasStringProperty(obj, key)) {
    return obj[key];
  }
  return fallback;
}

/**
 * Safely extract number property
 */
export function safeNumber(obj: unknown, key: string, fallback = 0): number {
  if (hasNumberProperty(obj, key)) {
    return obj[key];
  }
  return fallback;
}

/**
 * Safely extract array property
 */
export function safeArray<T>(obj: unknown, key: string): T[] {
  if (isObject(obj) && hasProperty(obj, key) && isArray(obj[key])) {
    return obj[key] as T[];
  }
  return [];
}

/**
 * Extract match locations from a file result
 */
export function extractMatchLocations(matches: unknown[]): Array<{
  line: number;
  column?: number;
  value?: string;
  byteOffset?: number;
  charOffset?: number;
}> {
  return matches.map((m) => {
    if (!isObject(m)) return { line: 0 };
    return {
      line: safeNumber(m, 'line', 0),
      column: hasNumberProperty(m, 'column') ? m.column : undefined,
      value: hasStringProperty(m, 'value') ? m.value.trim() : undefined,
      byteOffset: hasNumberProperty(m, 'byteOffset') ? m.byteOffset : undefined,
      charOffset: hasNumberProperty(m, 'charOffset') ? m.charOffset : undefined,
    };
  });
}

/**
 * Transform pagination from MCP format to skill format
 */
export function transformPagination(pagination: unknown): { page: number; total: number; hasMore: boolean } | undefined {
  if (!isObject(pagination)) return undefined;
  
  const currentPage = safeNumber(pagination, 'currentPage', 1);
  const totalPages = safeNumber(pagination, 'totalPages', 1);
  const hasMore = hasProperty(pagination, 'hasMore') && pagination.hasMore === true;
  
  return { page: currentPage, total: totalPages, hasMore };
}
