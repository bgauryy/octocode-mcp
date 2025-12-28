/**
 * Core pagination utilities
 * Shared pagination logic for character-based content pagination
 */

import type { PaginationInfo } from '../../types.js';
import type {
  PaginationMetadata,
  ApplyPaginationOptions,
  SliceByCharResult,
} from './types.js';

/**
 * Convert character offset to byte offset, ensuring we don't split UTF-8 characters
 */
function charOffsetToByteOffset(text: string, charOffset: number): number {
  if (charOffset <= 0) return 0;
  if (charOffset >= text.length) {
    return Buffer.byteLength(text, 'utf-8');
  }
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
    const buffer = Buffer.from(content, 'utf-8');
    const startPos = Math.min(charOffset, totalBytes);
    const endPos = Math.min(startPos + charLength, totalBytes);

    const slice = buffer.subarray(startPos, endPos);
    paginatedContent = slice.toString('utf-8');
    startBytePos = startPos;
    actualByteLength = slice.length;
    hasMore = endPos < totalBytes;
    nextCharOffset = hasMore ? endPos : undefined;

    const pageSize = charLength;
    currentPage = Math.floor(actualOffset / pageSize) + 1;
    totalPages = Math.ceil(totalBytes / pageSize);
  } else {
    const startCharPos = Math.min(charOffset, totalChars);
    const endCharPos = Math.min(startCharPos + charLength, totalChars);

    paginatedContent = content.substring(startCharPos, endCharPos);

    startBytePos = charOffsetToByteOffset(content, startCharPos);
    actualByteLength = Buffer.byteLength(paginatedContent, 'utf-8');

    hasMore = endCharPos < totalChars;
    const nextCharPos = hasMore ? endCharPos : undefined;
    nextCharOffset =
      nextCharPos !== undefined
        ? charOffsetToByteOffset(content, nextCharPos)
        : undefined;

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
): SliceByCharResult {
  const totalChars = text.length;

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

  const lines: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lines.push(i + 1); // Start of next line
    }
  }

  let startLineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]! <= charOffset) {
      startLineIdx = i;
    } else {
      break;
    }
  }

  const actualOffset = lines[startLineIdx]!;

  let endPos = Math.min(actualOffset + charLength, totalChars);
  let endLineIdx = startLineIdx;

  for (let i = startLineIdx; i < lines.length; i++) {
    if (lines[i]! < endPos) {
      endLineIdx = i;
    } else {
      break;
    }
  }

  if (endLineIdx < lines.length - 1 && endPos < lines[endLineIdx + 1]!) {
    endPos = lines[endLineIdx + 1]!;
  } else if (endLineIdx === lines.length - 1 && endPos < totalChars) {
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
