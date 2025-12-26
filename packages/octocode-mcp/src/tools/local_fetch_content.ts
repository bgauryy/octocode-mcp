import { readFile, stat } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import { minifyContentSync } from '../utils/minifier/minifierSync.js';
import { getToolHints } from './hints.js';
import {
  applyPagination,
  generatePaginationHints,
  createPaginationInfo,
} from '../utils/local/utils/pagination.js';
import { RESOURCE_LIMITS, DEFAULTS } from '../utils/constants.js';
import {
  validateToolPath,
  createErrorResult,
} from '../utils/local/utils/toolHelpers.js';
import type { FetchContentQuery, FetchContentResult } from '../utils/types.js';
import { ToolErrors, ERROR_CODES } from '../errorCodes.js';

export async function fetchContent(
  query: FetchContentQuery
): Promise<FetchContentResult> {
  try {
    const pathValidation = validateToolPath(query, 'LOCAL_FETCH_CONTENT');
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as FetchContentResult;
    }

    const absolutePath = isAbsolute(query.path)
      ? query.path
      : resolve(process.cwd(), query.path);

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
        query.matchStringCaseSensitive ?? false,
        50
      );

      if (result.lines.length === 0) {
        const contextHints = [
          `Searched ${totalLines} line${totalLines === 1 ? '' : 's'} - no matches found`,
        ];

        // Add pattern-specific hints
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

      // Apply minification BEFORE size check (fixes patternTooBroad false positives)
      if (query.minified !== false) {
        try {
          const originalLength = resultContent.length;
          const minifiedContent = minifyContentSync(resultContent, query.path);
          if (minifiedContent.length < originalLength) {
            resultContent = minifiedContent;
          }
        } catch {
          // Keep original if minification fails
        }
      }

      if (result.matchCount > 50) {
        return {
          status: 'hasResults',
          path: query.path,
          cwd: process.cwd(),
          content: resultContent,
          contentLength: resultContent.length,
          isPartial: true,
          totalLines,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          warnings: [
            `Pattern matched ${result.matchCount} lines. Truncated to first 50 matches.`,
          ],
          hints: [
            `Pattern matched ${result.matchCount} lines - likely too generic`,
            'Make the pattern more specific to target only what you need',
            'TIP: Use charLength to paginate if you need all matches',
          ],
        };
      }

      if (
        !query.charLength &&
        resultContent.length > DEFAULTS.MAX_OUTPUT_CHARS
      ) {
        const autoPagination = applyPagination(
          resultContent,
          0,
          RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH
        );

        return {
          status: 'hasResults',
          path: query.path,
          cwd: process.cwd(),
          content: autoPagination.paginatedContent,
          contentLength: autoPagination.paginatedContent.length,
          isPartial: true,
          totalLines,
          pagination: createPaginationInfo(autoPagination),
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          warnings: [
            `Auto-paginated: ${result.matchCount} matches exceeded display limit`,
          ],
          hints: [
            ...getToolHints('LOCAL_FETCH_CONTENT', 'hasResults'),
            ...generatePaginationHints(autoPagination, {
              toolName: 'localGetFileContent',
            }),
          ],
        };
      }

      isPartial = true;
    } else {
      resultContent = content;
      isPartial = false;

      if (query.minified !== false) {
        try {
          const originalLength = resultContent.length;
          const minifiedContent = minifyContentSync(resultContent, query.path);
          if (minifiedContent.length < originalLength) {
            resultContent = minifiedContent;
          }
        } catch {
          // Keep original if minification fails
        }
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
      ? generatePaginationHints(pagination, { toolName: 'localGetFileContent' })
      : [];

    return {
      status: 'hasResults',
      path: query.path,
      cwd: process.cwd(),
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
  caseSensitive: boolean = false,
  maxMatches?: number
): {
  lines: string[];
  matchRanges: Array<{ start: number; end: number }>;
  matchCount: number;
} {
  const matchingLineNumbers: number[] = [];

  // Compile regex once if needed
  let regex: RegExp | null = null;
  if (isRegex) {
    try {
      const flags = caseSensitive ? '' : 'i';
      regex = new RegExp(pattern, flags);
    } catch (error) {
      throw new Error(
        `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const literalPattern = caseSensitive ? pattern : pattern.toLowerCase();

  lines.forEach((line, index) => {
    const matches = isRegex
      ? regex!.test(line)
      : caseSensitive
        ? line.includes(pattern)
        : line.toLowerCase().includes(literalPattern);

    if (matches) {
      matchingLineNumbers.push(index + 1);
    }
  });

  const totalMatchCount = matchingLineNumbers.length;

  if (totalMatchCount === 0) {
    return { lines: [], matchRanges: [], matchCount: 0 };
  }

  const matchesToProcess = maxMatches
    ? matchingLineNumbers.slice(0, maxMatches)
    : matchingLineNumbers;

  // Group consecutive matches to avoid duplicating context
  const ranges: Array<{ start: number; end: number }> = [];
  const firstMatchLine = matchesToProcess[0]!;
  let currentRange = {
    start: Math.max(1, firstMatchLine - contextLines),
    end: Math.min(lines.length, firstMatchLine + contextLines),
  };

  for (let i = 1; i < matchesToProcess.length; i++) {
    const matchLine = matchesToProcess[i]!;
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
      const prevRange = ranges[idx - 1]!;
      const omittedLines = range.start - prevRange.end - 1;
      if (omittedLines > 0) {
        resultLines.push('');
        resultLines.push(`... [${omittedLines} lines omitted] ...`);
        resultLines.push('');
      }
    }
    resultLines.push(...lines.slice(range.start - 1, range.end));
  });

  return {
    lines: resultLines,
    matchRanges: ranges,
    matchCount: totalMatchCount,
  };
}
