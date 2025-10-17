/**
 * local_fetch_content tool - File content fetching with partial read support
 */

import { readFile } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import { pathValidator } from '../security/pathValidator.js';
import { minifyContent } from '../utils/minifier.js';
import { getToolHints } from './hints.js';
import type { FetchContentQuery, FetchContentResult } from '../types.js';

/**
 * Executes a file content fetch query
 */
export async function fetchContent(
  query: FetchContentQuery
): Promise<FetchContentResult> {
  try {
    // Validate path
    const pathValidation = pathValidator.validate(query.path);
    if (!pathValidation.isValid) {
      return {
        status: 'error',
        error: pathValidation.error,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
      };
    }

    // Resolve absolute path
    const absolutePath = isAbsolute(query.path)
      ? query.path
      : resolve(process.cwd(), query.path);

    // Read file content
    let content: string;
    try {
      content = await readFile(absolutePath, 'utf-8');
    } catch (error) {
      return {
        status: 'error',
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        path: query.path,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_FETCH_CONTENT', 'error'),
      };
    }

    // Split into lines for processing
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Determine what content to return based on query parameters
    let resultContent: string;
    let isPartial = false;
    let startLine: number | undefined;
    let endLine: number | undefined;

    if (query.fullContent) {
      // Return full content
      resultContent = content;
      isPartial = false;
    } else if (query.matchString) {
      // Find lines matching the string and return with context
      const result = extractMatchingLines(
        lines,
        query.matchString,
        query.matchStringContextLines ?? 5
      );

      if (result.lines.length === 0) {
        return {
          status: 'empty',
          path: query.path,
          error: `No matches found for pattern: ${query.matchString}`,
          totalLines,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          hints: getToolHints('LOCAL_FETCH_CONTENT', 'empty'),
        };
      }

      resultContent = result.lines.join('\n');
      isPartial = true;
      startLine = result.startLine;
      endLine = result.endLine;
    } else if (query.startLine !== undefined && query.endLine !== undefined) {
      // Return specific line range
      if (query.startLine < 1 || query.endLine < 1) {
        return {
          status: 'error',
          error: 'Line numbers must be greater than 0',
          path: query.path,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };
      }

      if (query.startLine > query.endLine) {
        return {
          status: 'error',
          error: 'startLine must be less than or equal to endLine',
          path: query.path,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };
      }

      if (query.startLine > totalLines) {
        return {
          status: 'error',
          error: `startLine ${query.startLine} exceeds file length (${totalLines} lines)`,
          path: query.path,
          totalLines,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };
      }

      const actualEndLine = Math.min(query.endLine, totalLines);
      resultContent = lines
        .slice(query.startLine - 1, actualEndLine)
        .join('\n');
      isPartial = true;
      startLine = query.startLine;
      endLine = actualEndLine;
    } else {
      // Default: return full content
      resultContent = content;
      isPartial = false;
    }

    // Apply minification if requested
    let minified = false;
    let minificationFailed = false;

    if (query.minified !== false) {
      // Default is true
      try {
        const originalLength = resultContent.length;
        const minifiedContent = minifyContent(resultContent, query.path);

        // If minification reduced size, use it
        if (minifiedContent.length < originalLength) {
          resultContent = minifiedContent;
          minified = true;
        } else {
          // Minification didn't help
          minificationFailed = true;
        }
      } catch {
        minificationFailed = true;
        // Keep the content as-is if minification fails
      }
    }

    // Check if we have content
    if (!resultContent || resultContent.trim().length === 0) {
      return {
        status: 'empty',
        path: query.path,
        totalLines,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_FETCH_CONTENT', 'empty'),
      };
    }

    return {
      status: 'hasResults',
      path: query.path,
      content: resultContent,
      contentLength: resultContent.length,
      isPartial,
      startLine,
      endLine,
      totalLines,
      minified,
      minificationFailed: minificationFailed || undefined,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_FETCH_CONTENT', 'hasResults'),
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      path: query.path,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_FETCH_CONTENT', 'error'),
    };
  }
}

/**
 * Extracts lines matching a pattern with context lines around them
 */
function extractMatchingLines(
  lines: string[],
  pattern: string,
  contextLines: number
): { lines: string[]; startLine: number; endLine: number } {
  const matchingLineNumbers: number[] = [];

  // Find all matching line numbers (1-based)
  lines.forEach((line, index) => {
    if (line.includes(pattern)) {
      matchingLineNumbers.push(index + 1);
    }
  });

  if (matchingLineNumbers.length === 0) {
    return { lines: [], startLine: 0, endLine: 0 };
  }

  // Determine the range to extract with context
  const firstMatch = matchingLineNumbers[0];
  const lastMatch = matchingLineNumbers[matchingLineNumbers.length - 1];

  const startLine = Math.max(1, firstMatch - contextLines);
  const endLine = Math.min(lines.length, lastMatch + contextLines);

  // Extract the lines (convert to 0-based indices)
  const extractedLines = lines.slice(startLine - 1, endLine);

  return {
    lines: extractedLines,
    startLine,
    endLine,
  };
}
