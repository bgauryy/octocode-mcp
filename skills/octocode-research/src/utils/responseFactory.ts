/**
 * Response builder factory for route handlers.
 * Eliminates duplicate transformation logic across route files.
 *
 * @module utils/responseFactory
 */

import type { Response } from 'express';
import { parseToolResponse, type ParsedResponse } from './responseParser.js';
import type { FileMatch, PaginationInfo } from '../types/responses.js';
import { extractFiles, extractPagination, extractTotalMatches } from '../types/responses.js';
import { isObject, hasProperty, isArray, hasStringProperty, hasNumberProperty } from '../types/guards.js';

// =============================================================================
// Types
// =============================================================================

interface RouteResponseOptions<T> {
  toolName: string;
  transform: (data: Record<string, unknown>, parsed: ParsedResponse) => T;
  buildResponse: (transformed: T, parsed: ParsedResponse) => Record<string, unknown>;
}

interface TransformContext {
  data: Record<string, unknown>;
  isError: boolean;
  hints: string[];
  research?: string;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * MCP tool response type for type casting
 */
interface McpToolResponse {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Create a route handler with standardized error handling and transformation
 */
function createRouteHandler<T>(options: RouteResponseOptions<T>) {
  return async function handleToolResponse(
    rawResult: unknown,
    res: Response,
  ): Promise<Response> {
    const parsed = parseToolResponse(rawResult as McpToolResponse);
    const { data, isError } = parsed;

    if (isError && hasProperty(data, 'error')) {
      return res.status(500).json({
        role: 'system',
        content: `Error from ${options.toolName}: ${data.error || 'Unknown error'}`,
        mcpHints: parsed.hints,
      });
    }

    const transformed = options.transform(data, parsed);
    const response = options.buildResponse(transformed, parsed);

    return res.status(isError ? 500 : 200).json(response);
  };
}

// =============================================================================
// Common Extractors (Type-Safe)
// =============================================================================

/**
 * Extract file matches from search results with proper typing
 */
function extractFileMatches(data: unknown): FileMatch[] {
  return extractFiles(data);
}

/**
 * Extract pagination info with proper typing
 */
function extractPaginationInfo(data: unknown): PaginationInfo | undefined {
  return extractPagination(data);
}

/**
 * Extract total match count with proper typing
 */
function extractMatchCount(data: unknown): number {
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
