/**
 * Unified character-based pagination utility
 * Provides consistent pagination across all tools with 10K character limit
 */

import { RESOURCE_LIMITS } from '../constants.js';
import type { PaginationInfo } from '../types.js';

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  /** Character offset to start from (default: 0) */
  charOffset?: number;
  /** Maximum characters to return (max: 10,000 for most tools, 50,000 for fetch_content) */
  charLength?: number;
  /** Enable token usage warnings (default: true) */
  enableWarnings?: boolean;
  /** Additional custom hints to include */
  customHints?: string[];
  /** Tool name for context (optional) */
  toolName?: string;
}

/**
 * Pagination result metadata
 */
export interface PaginationMetadata {
  /** Content after pagination */
  paginatedContent: string;
  /** Applied character offset */
  charOffset: number;
  /** Actual length of returned content */
  charLength: number;
  /** Total characters in complete content */
  totalChars: number;
  /** True if more content available */
  hasMore: boolean;
  /** Suggested offset for next page (undefined if no more) */
  nextCharOffset?: number;
  /** Estimated tokens for this page */
  estimatedTokens: number;
  /** Current page number (1-based) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Apply character-based pagination to content with enhanced options
 *
 * @param content - Full content to paginate
 * @param charOffset - Starting position (default: 0)
 * @param charLength - Maximum characters to return (optional)
 * @param options - Additional pagination options
 * @returns Pagination metadata with sliced content
 */
export function applyPagination(
  content: string,
  charOffset: number = 0,
  charLength?: number,
  options?: {
    actualOffset?: number; // CRITICAL: For line-aware pagination
    enableWarnings?: boolean;
    customHints?: string[];
    toolName?: string;
  }
): PaginationMetadata {
  const totalChars = content.length;

  if (!charLength) {
    const estimatedTokens = Math.ceil(
      totalChars / RESOURCE_LIMITS.CHARS_PER_TOKEN
    );
    return {
      paginatedContent: content,
      charOffset: 0,
      charLength: totalChars,
      totalChars,
      hasMore: false,
      estimatedTokens,
      currentPage: 1,
      totalPages: 1,
    };
  }

  const startPos = Math.min(charOffset, totalChars);
  const endPos = Math.min(startPos + charLength, totalChars);

  const paginatedContent = content.substring(startPos, endPos);
  const actualLength = paginatedContent.length;

  const hasMore = endPos < totalChars;
  const nextCharOffset = hasMore ? endPos : undefined;
  const estimatedTokens = Math.ceil(
    actualLength / RESOURCE_LIMITS.CHARS_PER_TOKEN
  );

  const effectiveOffset = options?.actualOffset ?? charOffset;

  const currentPage = Math.floor(effectiveOffset / charLength) + 1;
  const totalPages = Math.ceil(totalChars / charLength);

  return {
    paginatedContent,
    charOffset: startPos,
    charLength: actualLength,
    totalChars,
    hasMore,
    nextCharOffset,
    estimatedTokens,
    currentPage,
    totalPages,
  };
}

/**
 * Generate pagination hints for tool responses with enhanced options
 *
 * @param metadata - Pagination metadata
 * @param options - Options for hint generation
 * @returns Array of hint strings
 */
export function generatePaginationHints(
  metadata: PaginationMetadata,
  options?: {
    enableWarnings?: boolean;
    customHints?: string[];
    toolName?: string;
  }
): string[] {
  const enableWarnings = options?.enableWarnings ?? true;
  const customHints = options?.customHints ?? [];
  const hints: string[] = [...customHints];
  const {
    charOffset,
    charLength,
    totalChars,
    hasMore,
    nextCharOffset,
    estimatedTokens,
  } = metadata;

  if (
    enableWarnings &&
    estimatedTokens > RESOURCE_LIMITS.TOKEN_CRITICAL_THRESHOLD
  ) {
    hints.push(
      'CRITICAL: >50K tokens! Result is TOO LARGE!',
      `ACTION: Use pagination with charLength=${RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH} for manageable chunks`
    );
  } else if (
    enableWarnings &&
    estimatedTokens > RESOURCE_LIMITS.TOKEN_HIGH_THRESHOLD
  ) {
    hints.push(
      'WARNING: >25K tokens. Result is very heavy.',
      `Better: Use charLength=${RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH}-20000 for moderate chunks`
    );
  } else if (
    enableWarnings &&
    estimatedTokens > RESOURCE_LIMITS.TOKEN_MODERATE_THRESHOLD
  ) {
    hints.push(
      'NOTICE: >10K tokens. Result is substantial.',
      'Consider: Using charLength parameter to paginate'
    );
  } else if (
    enableWarnings &&
    estimatedTokens > RESOURCE_LIMITS.TOKEN_NOTICE_THRESHOLD
  ) {
    hints.push('Moderate usage (2.5-10K tokens). Good for analysis.');
  } else if (enableWarnings) {
    hints.push('Light usage (<2.5K tokens). Efficient query!');
  }

  // Pagination status
  if (hasMore) {
    const remaining = totalChars - charOffset - charLength;
    const totalTokens = Math.ceil(totalChars / RESOURCE_LIMITS.CHARS_PER_TOKEN);
    hints.push(
      `Size: ${totalChars.toLocaleString()} chars total (~${totalTokens.toLocaleString()} tokens)`,
      `This page: ${charLength.toLocaleString()} chars (~${estimatedTokens.toLocaleString()} tokens)`,
      `More available: ${remaining.toLocaleString()} chars remaining`,
      'Instruction: This is a paginated result - use pagination to see more results',
      `Next page: Use charOffset=${nextCharOffset}, charLength=${charLength}`
    );
  } else if (charOffset > 0) {
    const totalTokens = Math.ceil(totalChars / RESOURCE_LIMITS.CHARS_PER_TOKEN);
    hints.push(
      `Complete: This is the final page`,
      `Total: ${totalChars.toLocaleString()} chars (~${totalTokens.toLocaleString()} tokens)`
    );
  } else {
    hints.push(
      `Complete: All results shown (${charLength.toLocaleString()} chars, ~${estimatedTokens.toLocaleString()} tokens)`
    );
  }

  return hints;
}

/**
 * Serialize data to JSON string for pagination
 * Useful for paginating structured data (arrays, objects)
 *
 * @param data - Data to serialize
 * @param prettyPrint - Format with indentation (default: false)
 * @returns JSON string
 */
export function serializeForPagination(
  data: unknown,
  prettyPrint: boolean = false
): string {
  return JSON.stringify(data, null, prettyPrint ? 2 : undefined);
}

/**
 * Line-aware pagination result
 */
export interface LineAwarePaginationResult {
  /** Sliced content (ends on line boundary) */
  sliced: string;
  /** Actual character offset (adjusted to line start) */
  actualOffset: number;
  /** Actual length (adjusted to line end) */
  actualLength: number;
  /** True if more content available */
  hasMore: boolean;
  /** Next character offset (aligned to line boundary) */
  nextOffset: number;
  /** Number of lines in sliced content */
  lineCount: number;
  /** Total characters in original text */
  totalChars: number;
}

/**
 * Slice text by character offset but respect line boundaries
 * Ensures we never cut mid-line, which is critical for line-based tools like ripgrep
 *
 * This function solves the fundamental issue of mixing line-based search output
 * (ripgrep) with character-based pagination. It ensures:
 * - Pagination always starts at the beginning of a line
 * - Pagination always ends at the end of a line
 * - Line numbers and context remain intact
 * - Works correctly with minified files (single long line)
 *
 * @param text - Full text to paginate
 * @param charOffset - Desired character offset (will be adjusted to line start)
 * @param charLength - Desired character length (will be adjusted to line end)
 * @returns Line-aware pagination result with adjusted offsets
 *
 * @example
 * const text = "line1\nline2\nline3\n";
 * const result = sliceByCharRespectLines(text, 8, 10);
 * // result.sliced = "line2\nline3\n" (adjusted to line boundaries)
 * // result.actualOffset = 6 (start of line2)
 * // result.actualLength = 13 (includes both complete lines)
 */
export function sliceByCharRespectLines(
  text: string,
  charOffset: number,
  charLength: number
): LineAwarePaginationResult {
  const totalChars = text.length;

  // Handle edge case: empty text
  if (totalChars === 0) {
    return {
      sliced: '',
      actualOffset: 0,
      actualLength: 0,
      hasMore: false,
      nextOffset: 0,
      lineCount: 0,
      totalChars: 0,
    };
  }

  // Handle edge case: charOffset beyond text length
  if (charOffset >= totalChars) {
    return {
      sliced: '',
      actualOffset: totalChars,
      actualLength: 0,
      hasMore: false,
      nextOffset: totalChars,
      lineCount: 0,
      totalChars,
    };
  }

  // STEP 1: Find line boundary at or before charOffset
  let adjustedOffset = charOffset;

  // Move back to last newline (or stay at 0 if at start)
  if (adjustedOffset > 0) {
    // If we're not at a newline, move back to find one
    while (adjustedOffset > 0 && text[adjustedOffset - 1] !== '\n') {
      adjustedOffset--;
    }
  }

  // STEP 2: Calculate desired end position based on ACTUAL offset (not original charOffset)
  // This ensures charLength applies from the adjusted start, not the requested offset
  const desiredEnd = Math.min(adjustedOffset + charLength, totalChars);

  // STEP 3: Find line boundary - extend FORWARD to next newline to complete the line
  // This ensures clean output and maximizes content returned
  let adjustedEnd = desiredEnd;

  // If we're at the end of text, we're done
  if (adjustedEnd >= totalChars) {
    adjustedEnd = totalChars;
  } else {
    // Check if we're already at a line boundary
    // We're at a line boundary if the character just before adjustedEnd is a newline
    // OR if adjustedEnd is at position 0
    const atLineBoundary = adjustedEnd === 0 || text[adjustedEnd - 1] === '\n';

    if (!atLineBoundary) {
      // We're mid-line, extend forward to the next newline
      while (adjustedEnd < totalChars && text[adjustedEnd] !== '\n') {
        adjustedEnd++;
      }
      // Include the newline character if found
      if (adjustedEnd < totalChars && text[adjustedEnd] === '\n') {
        adjustedEnd++;
      }
    }
  }

  // STEP 4: Extract sliced content
  const sliced = text.slice(adjustedOffset, adjustedEnd);
  const actualLength = adjustedEnd - adjustedOffset;

  // STEP 5: Calculate metadata
  const hasMore = adjustedEnd < totalChars;
  const nextOffset = hasMore ? adjustedEnd : totalChars;

  // Count lines (count newlines)
  const lineCount = (sliced.match(/\n/g) || []).length;

  return {
    sliced,
    actualOffset: adjustedOffset,
    actualLength,
    hasMore,
    nextOffset,
    lineCount,
    totalChars,
  };
}

/**
 * Creates PaginationInfo object from PaginationMetadata
 *
 * This helper centralizes pagination info creation for consistency across all tools.
 * It extracts the standard pagination fields from PaginationMetadata and returns
 * them as a PaginationInfo object that matches the approved pagination structure.
 *
 * @param metadata - Pagination metadata from applyPagination() or similar functions
 * @returns PaginationInfo object with all required fields
 *
 * @example
 * const pagination = applyPagination(content, 0, 10000);
 * return {
 *   status: 'hasResults',
 *   data: content,
 *   pagination: createPaginationInfo(pagination)
 * };
 */
export function createPaginationInfo(
  metadata: PaginationMetadata
): PaginationInfo {
  return {
    currentPage: metadata.currentPage,
    totalPages: metadata.totalPages,
    charOffset: metadata.charOffset,
    charLength: metadata.charLength,
    totalChars: metadata.totalChars,
    hasMore: metadata.hasMore,
  };
}
