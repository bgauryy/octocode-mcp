/**
 * Pagination utilities for character-based content pagination
 */

import type { PaginationInfo } from '../../../utils/types.js';

/**
 * Pagination metadata returned by applyPagination
 */
export interface PaginationMetadata {
  paginatedContent: string;
  charOffset: number;
  charLength: number;
  totalChars: number;
  hasMore: boolean;
  nextCharOffset?: number;
  estimatedTokens?: number;
  currentPage: number;
  totalPages: number;
  actualOffset?: number;
  actualLength?: number;
}

/**
 * Options for applyPagination
 */
interface ApplyPaginationOptions {
  actualOffset?: number;
  /**
   * Whether charOffset and charLength are character offsets (default) or byte offsets
   * - 'characters': Treat offsets as character positions (for local tools)
   * - 'bytes': Treat offsets as byte positions (for GitHub API compatibility)
   */
  mode?: 'characters' | 'bytes';
}

/**
 * Options for generatePaginationHints
 */
interface GeneratePaginationHintsOptions {
  enableWarnings?: boolean;
  customHints?: string[];
  toolName?: string;
}

/**
 * Convert character offset to byte offset, ensuring we don't split UTF-8 characters
 */
function charOffsetToByteOffset(text: string, charOffset: number): number {
  if (charOffset <= 0) return 0;
  if (charOffset >= text.length) {
    return Buffer.byteLength(text, 'utf-8');
  }
  // Use substring to get characters up to offset, then get byte length
  // This ensures we don't split multi-byte characters
  return Buffer.byteLength(text.substring(0, charOffset), 'utf-8');
}

/**
 * Apply pagination to content based on character offset and length
 * Supports both character offsets (default) and byte offsets (for GitHub API compatibility)
 */
export function applyPagination(
  content: string,
  charOffset: number = 0,
  charLength?: number,
  options: ApplyPaginationOptions = {}
): PaginationMetadata {
  const mode = options.mode ?? 'characters';
  const totalChars = content.length;
  const totalBytes = Buffer.byteLength(content, 'utf-8');
  const actualOffset = options.actualOffset ?? charOffset;

  // If no charLength provided, return full content
  if (charLength === undefined) {
    return {
      paginatedContent: content,
      charOffset: 0,
      charLength: totalBytes,
      totalChars: totalBytes, // Using bytes as totalChars for compatibility
      hasMore: false,
      estimatedTokens: Math.ceil(content.length / 4),
      currentPage: 1,
      totalPages: 1,
      actualOffset: 0,
      actualLength: totalBytes,
    };
  }

  let paginatedContent: string;
  let startBytePos: number;
  let actualByteLength: number;
  let hasMore: boolean;
  let nextCharOffset: number | undefined;
  let currentPage: number;
  let totalPages: number;

  if (mode === 'bytes') {
    // Byte offset mode (for GitHub API compatibility)
    const buffer = Buffer.from(content, 'utf-8');
    const startPos = Math.min(charOffset, totalBytes);
    const endPos = Math.min(startPos + charLength, totalBytes);

    const slice = buffer.subarray(startPos, endPos);
    paginatedContent = slice.toString('utf-8');
    startBytePos = startPos;
    actualByteLength = slice.length;
    hasMore = endPos < totalBytes;
    nextCharOffset = hasMore ? endPos : undefined;

    // Calculate page numbers based on byte offsets
    const pageSize = charLength;
    currentPage = Math.floor(actualOffset / pageSize) + 1;
    totalPages = Math.ceil(totalBytes / pageSize);
  } else {
    // Character offset mode (default, for local tools)
    const startCharPos = Math.min(charOffset, totalChars);
    const endCharPos = Math.min(startCharPos + charLength, totalChars);

    // Slice by characters (respects UTF-8 boundaries)
    paginatedContent = content.substring(startCharPos, endCharPos);

    // Convert character positions to byte positions for metadata
    startBytePos = charOffsetToByteOffset(content, startCharPos);
    actualByteLength = Buffer.byteLength(paginatedContent, 'utf-8');

    hasMore = endCharPos < totalChars;
    // Return character offset for nextCharOffset (for hints that tell users what charOffset to use)
    const nextCharPos = hasMore ? endCharPos : undefined;
    nextCharOffset =
      nextCharPos !== undefined
        ? charOffsetToByteOffset(content, nextCharPos)
        : undefined;

    // Calculate page numbers based on character offsets
    const pageSize = charLength;
    currentPage = Math.floor(actualOffset / pageSize) + 1;
    totalPages = Math.ceil(totalChars / pageSize);
  }

  return {
    paginatedContent,
    charOffset: startBytePos, // Return byte offset for compatibility with existing code
    charLength: actualByteLength, // Return byte length for compatibility
    totalChars: totalBytes, // Using bytes as totalChars for compatibility
    hasMore,
    nextCharOffset,
    estimatedTokens: Math.ceil(paginatedContent.length / 4),
    currentPage,
    totalPages,
    actualOffset: startBytePos,
    actualLength: actualByteLength,
  };
}

/**
 * Generate pagination hints based on metadata
 */
export function generatePaginationHints(
  metadata: PaginationMetadata,
  options: GeneratePaginationHintsOptions = {}
): string[] {
  const { enableWarnings = true, customHints = [] } = options;
  const hints: string[] = [];

  // Add custom hints first
  hints.push(...customHints);

  // Token usage warnings (if enabled)
  if (enableWarnings && metadata.estimatedTokens) {
    const tokens = metadata.estimatedTokens;

    if (tokens > 50000) {
      hints.push(
        '🚨 CRITICAL: Response TOO LARGE (>50K tokens) - will likely exceed model context limits',
        'ACTION REQUIRED: Use smaller charLength or refine query to reduce output size'
      );
    } else if (tokens > 30000) {
      hints.push(
        '⚠️ WARNING: High token usage (>30K tokens) - may approach context limits',
        'RECOMMENDATION: Consider reducing charLength or using more specific queries'
      );
    } else if (tokens > 15000) {
      hints.push(
        'ℹ️ NOTICE: Moderate token usage (>15K tokens) - monitor context window usage'
      );
    } else if (tokens > 5000) {
      hints.push(
        'ℹ️ Moderate usage: Response uses ~' +
          tokens.toLocaleString() +
          ' tokens'
      );
    } else {
      hints.push(
        '✓ Efficient query: Response uses ~' +
          tokens.toLocaleString() +
          ' tokens'
      );
    }
  }

  // Pagination navigation hints
  if (metadata.hasMore && metadata.nextCharOffset !== undefined) {
    hints.push(
      '📄 More available: This is page ' +
        metadata.currentPage +
        ' of ' +
        metadata.totalPages,
      '▶ Next page: Use charOffset=' + metadata.nextCharOffset + ' to continue'
    );
  } else if (metadata.charOffset > 0 && !metadata.hasMore) {
    hints.push('✓ Final page: Reached end of content');
  }

  return hints;
}

/**
 * Serialize data for pagination (convert to JSON string)
 */
export function serializeForPagination(
  data: unknown,
  pretty: boolean = false
): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

/**
 * Slice text by character count while respecting line boundaries
 */
export function sliceByCharRespectLines(
  text: string,
  charOffset: number,
  charLength: number
): {
  sliced: string;
  actualOffset: number;
  actualLength: number;
  hasMore: boolean;
  nextOffset?: number;
  lineCount: number;
  totalChars: number;
} {
  const totalChars = text.length;

  // Handle empty text
  if (totalChars === 0) {
    return {
      sliced: '',
      actualOffset: 0,
      actualLength: 0,
      hasMore: false,
      lineCount: 0,
      totalChars: 0,
    };
  }

  // Handle offset beyond text length
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

  // Find line boundaries
  const lines: number[] = [0]; // Start of first line
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lines.push(i + 1); // Start of next line
    }
  }

  // Find the line that contains charOffset
  let startLineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]! <= charOffset) {
      startLineIdx = i;
    } else {
      break;
    }
  }

  // Adjust offset to start of line if mid-line
  const actualOffset = lines[startLineIdx]!;

  // Find end position (try to respect charLength but extend to complete lines)
  let endPos = Math.min(actualOffset + charLength, totalChars);
  let endLineIdx = startLineIdx;

  // Find the line that contains endPos (use < to not include lines starting AT endPos)
  for (let i = startLineIdx; i < lines.length; i++) {
    if (lines[i]! < endPos) {
      endLineIdx = i;
    } else {
      break;
    }
  }

  // If we're mid-line at the end, extend to end of line
  // (only if endPos is not already at a line boundary)
  if (endLineIdx < lines.length - 1 && endPos < lines[endLineIdx + 1]!) {
    endPos = lines[endLineIdx + 1]!;
  } else if (endLineIdx === lines.length - 1 && endPos < totalChars) {
    // Last line - include until end of text
    endPos = totalChars;
  }

  const sliced = text.substring(actualOffset, endPos);
  const hasMore = endPos < totalChars;
  const lineCount = sliced.split('\n').length - 1; // Count newlines

  return {
    sliced,
    actualOffset,
    actualLength: sliced.length,
    hasMore,
    nextOffset: hasMore ? endPos : undefined,
    lineCount,
    totalChars,
  };
}

/**
 * Create PaginationInfo from PaginationMetadata
 */
export function createPaginationInfo(
  metadata: PaginationMetadata
): PaginationInfo {
  return {
    currentPage: metadata.currentPage,
    totalPages: metadata.totalPages,
    hasMore: metadata.hasMore,
    charOffset: metadata.charOffset,
    charLength: metadata.charLength,
    totalChars: metadata.totalChars,
  };
}
