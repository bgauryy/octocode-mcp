import { readFile, stat } from 'fs/promises';
import { minifyContent } from '../utils/minifier.js';
import { getToolHints } from './hints.js';
import {
  applyPagination,
  generatePaginationHints,
  createPaginationInfo,
} from '../utils/pagination.js';
import { RESOURCE_LIMITS, DEFAULTS } from '../constants.js';
import { validateToolPath, createErrorResult } from '../utils/toolHelpers.js';
import type { FetchContentQuery, FetchContentResult } from '../types.js';
import { ToolErrors, ERROR_CODES } from '../errors/errorCodes.js';

export async function fetchContent(
  query: FetchContentQuery
): Promise<FetchContentResult> {
  try {
    const pathValidation = validateToolPath(query, 'LOCAL_FETCH_CONTENT');
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as FetchContentResult;
    }

    const absolutePath = pathValidation.sanitizedPath;
    let fileStats;
    try {
      fileStats = await stat(absolutePath);
    } catch (error) {
      const toolError = ToolErrors.fileAccessFailed(
        query.path,
        error instanceof Error ? error : undefined
      );
      return createErrorResult(toolError, 'LOCAL_FETCH_CONTENT', query, {
        path: query.path,
      }) as FetchContentResult;
    }

    const fileSizeKB = fileStats.size / 1024;
    if (
      fileSizeKB > RESOURCE_LIMITS.LARGE_FILE_THRESHOLD_KB &&
      !query.charLength &&
      !query.matchString
    ) {
      const toolError = ToolErrors.fileTooLarge(
        query.path,
        fileSizeKB,
        RESOURCE_LIMITS.LARGE_FILE_THRESHOLD_KB
      );
      return createErrorResult(toolError, 'LOCAL_FETCH_CONTENT', query, {
        path: query.path,
        hints: [
          'Best approach: Use matchString to extract specific functions/classes you actually need',
          'Alternative: Use charLength for pagination if you need to browse through the file systematically',
          'Why matchString works better: Gets only relevant sections, faster, and uses fewer tokens',
          'Critical: fullContent without charLength will fail on large files - always specify a reading strategy',
        ],
      }) as FetchContentResult;
    }

    let content: string;
    try {
      content = await readFile(absolutePath, 'utf-8');
    } catch (error) {
      const toolError = ToolErrors.fileReadFailed(
        query.path,
        error instanceof Error ? error : undefined
      );
      return createErrorResult(toolError, 'LOCAL_FETCH_CONTENT', query, {
        path: query.path,
      }) as FetchContentResult;
    }

    const lines = content.split('\n');
    const totalLines = lines.length;
    let resultContent: string;
    let isPartial = false;

    if (query.matchString) {
      const result = extractMatchingLines(
        lines,
        query.matchString,
        query.matchStringContextLines ?? 5,
        query.matchStringIsRegex ?? false,
        query.matchStringCaseSensitive ?? false
      );

      if (result.lines.length === 0) {
        const contextHints = [
          `Searched ${totalLines} line${totalLines === 1 ? '' : 's'} - no matches found`,
        ];
        if (query.matchStringIsRegex) {
          contextHints.push(
            'TIP: Regex pattern may be too specific - try simplifying'
          );
        } else {
          contextHints.push(
            'TIP: Try matchStringIsRegex=true for pattern matching (e.g., "export.*function")'
          );
        }
        if (query.matchStringCaseSensitive) {
          contextHints.push(
            'TIP: Case-sensitive mode active - try matchStringCaseSensitive=false'
          );
        }
        contextHints.push(
          'TIP: Verify file contains expected content or try simpler pattern'
        );

        return {
          status: 'empty',
          path: query.path,
          errorCode: ERROR_CODES.NO_MATCHES,
          totalLines,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          hints: [
            ...getToolHints('LOCAL_FETCH_CONTENT', 'empty'),
            '',
            ...contextHints,
          ],
        };
      }

      resultContent = result.lines.join('\n');
      if (
        !query.charLength &&
        resultContent.length > DEFAULTS.MAX_OUTPUT_CHARS
      ) {
        const toolError = ToolErrors.patternTooBroad(
          query.matchString || '',
          result.matchRanges.length
        );
        return createErrorResult(toolError, 'LOCAL_FETCH_CONTENT', query, {
          path: query.path,
          totalLines,
          hints: [
            `Your pattern matched extensively - likely hitting common code`,
            'Make the pattern more specific to target only what you need, or use charLength to paginate results',
            'Possible causes: Minified files, repeated patterns, or overly broad match terms',
            'Strategy: Refine matchString to be more selective, or explore with pagination',
          ],
        }) as FetchContentResult;
      }
      isPartial = true;
    } else {
      resultContent = content;
      isPartial = false;
    }

    if (query.minified !== false) {
      try {
        const originalLength = resultContent.length;
        const minifiedContent = minifyContent(resultContent, query.path);
        if (minifiedContent.length < originalLength) {
          resultContent = minifiedContent;
        }
      } catch {
        // Ignore minification errors
      }
    }

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

    if (!query.charLength && resultContent.length > DEFAULTS.MAX_OUTPUT_CHARS) {
      const toolError = ToolErrors.paginationRequired(resultContent.length);
      return createErrorResult(toolError, 'LOCAL_FETCH_CONTENT', query, {
        path: query.path,
        totalLines,
        hints: [
          `RECOMMENDED: charLength=${RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH} (paginate results)`,
          'ALTERNATIVE: Use matchString for targeted extraction',
          `NOTE: Results >10K chars require pagination for safety`,
        ],
      }) as FetchContentResult;
    }

    const pagination = applyPagination(
      resultContent,
      query.charOffset ?? 0,
      query.charLength
    );

    const baseHints = getToolHints('LOCAL_FETCH_CONTENT', 'hasResults');
    const paginationHints = query.charLength
      ? generatePaginationHints(pagination, { toolName: 'local_fetch_content' })
      : [];

    return {
      status: 'hasResults',
      path: query.path,
      content: pagination.paginatedContent,
      contentLength: pagination.paginatedContent.length,
      isPartial,
      totalLines,
      ...(query.charLength && {
        pagination: createPaginationInfo(pagination),
      }),
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [...baseHints, ...paginationHints],
    };
  } catch (error) {
    return createErrorResult(error, 'LOCAL_FETCH_CONTENT', query, {
      path: query.path,
    }) as FetchContentResult;
  }
}

function extractMatchingLines(
  lines: string[],
  pattern: string,
  contextLines: number,
  isRegex: boolean = false,
  caseSensitive: boolean = false
): { lines: string[]; matchRanges: Array<{ start: number; end: number }> } {
  const matchingLineNumbers: number[] = [];
  let regex: RegExp | null = null;
  const TIMEOUT_MS = 2000;
  const MAX_LINE_LENGTH_FOR_REGEX = 10000;
  const MAX_PATTERN_LENGTH = 500;

  if (isRegex) {
    if (pattern.length > MAX_PATTERN_LENGTH) {
      throw new Error(
        `Regex pattern too long (max ${MAX_PATTERN_LENGTH} chars)`
      );
    }
    try {
      const flags = caseSensitive ? '' : 'i';
      regex = new RegExp(pattern, flags);
    } catch (error) {
      throw new Error(
        `Invalid regex pattern: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const literalPattern = caseSensitive ? pattern : pattern.toLowerCase();
  const startTime = Date.now();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error(
        'Search timeout - matching took too long (potential ReDoS)'
      );
    }

    let matches = false;
    if (isRegex) {
      // Safety: truncate very long lines before regex to prevent backtracking freeze
      const searchLine =
        line.length > MAX_LINE_LENGTH_FOR_REGEX
          ? line.slice(0, MAX_LINE_LENGTH_FOR_REGEX)
          : line;
      matches = regex!.test(searchLine);
    } else {
      matches = caseSensitive
        ? line.includes(pattern)
        : line.toLowerCase().includes(literalPattern);
    }

    if (matches) {
      matchingLineNumbers.push(index + 1);
    }
  }

  if (matchingLineNumbers.length === 0) {
    return { lines: [], matchRanges: [] };
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let currentRange = {
    start: Math.max(1, matchingLineNumbers[0] - contextLines),
    end: Math.min(lines.length, matchingLineNumbers[0] + contextLines),
  };

  for (let i = 1; i < matchingLineNumbers.length; i++) {
    const matchLine = matchingLineNumbers[i];
    const rangeStart = Math.max(1, matchLine - contextLines);
    const rangeEnd = Math.min(lines.length, matchLine + contextLines);

    if (rangeStart <= currentRange.end + 1) {
      currentRange.end = Math.max(currentRange.end, rangeEnd);
    } else {
      ranges.push({ ...currentRange });
      currentRange = { start: rangeStart, end: rangeEnd };
    }
  }
  ranges.push(currentRange);

  const resultLines: string[] = [];
  ranges.forEach((range, idx) => {
    if (idx > 0) {
      const omittedLines = range.start - ranges[idx - 1].end - 1;
      if (omittedLines > 0) {
        resultLines.push('');
        resultLines.push(`... [${omittedLines} lines omitted] ...`);
        resultLines.push('');
      }
    }
    resultLines.push(...lines.slice(range.start - 1, range.end));
  });

  return { lines: resultLines, matchRanges: ranges };
}
