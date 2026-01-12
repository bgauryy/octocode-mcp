import { readFile, stat } from 'fs/promises';
import { minifyContentSync } from '../../utils/minifier/index.js';
import { getHints } from '../../hints/index.js';
import {
  applyPagination,
  generatePaginationHints,
  createPaginationInfo,
} from '../../utils/pagination/index.js';
import { RESOURCE_LIMITS, DEFAULTS } from '../../utils/core/constants.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import type {
  FetchContentQuery,
  FetchContentResult,
} from '../../utils/core/types.js';
import { ToolErrors, LOCAL_TOOL_ERROR_CODES } from '../../errorCodes.js';

/**
 * Apply minification to content (always enabled for token efficiency)
 * Only replaces content if minification reduces size
 *
 * @param content - The content to minify
 * @param filePath - File path for determining minification strategy
 * @returns Minified content if smaller, otherwise original
 */
function applyMinification(content: string, filePath: string): string {
  try {
    const minifiedContent = minifyContentSync(content, filePath);
    // Only use minified version if it's actually smaller
    return minifiedContent.length < content.length ? minifiedContent : content;
  } catch {
    // Keep original if minification fails
    return content;
  }
}

export async function fetchContent(
  query: FetchContentQuery
): Promise<FetchContentResult> {
  try {
    const pathValidation = validateToolPath(
      query,
      TOOL_NAMES.LOCAL_FETCH_CONTENT
    );
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as FetchContentResult;
    }

    const absolutePath = pathValidation.sanitizedPath!;

    let fileStats;
    try {
      fileStats = await stat(absolutePath);
    } catch (error) {
      const toolError = ToolErrors.fileAccessFailed(
        query.path,
        error instanceof Error ? error : undefined
      );
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
        extra: {
          path: query.path,
          resolvedPath: absolutePath,
        },
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
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
        extra: { path: query.path },
        customHints: [
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
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
        extra: { path: query.path },
      }) as FetchContentResult;
    }

    const lines = content.split('\n');
    const totalLines = lines.length;

    let resultContent: string;
    let isPartial = false;
    let actualStartLine: number | undefined;
    let actualEndLine: number | undefined;
    let matchRanges: Array<{ start: number; end: number }> | undefined;
    const warnings: string[] = [];

    // Priority: matchString > startLine/endLine > fullContent
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
            'TIP: Regex matches per-line only (not multiline). Verify pattern exists on a single line.'
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
          errorCode: LOCAL_TOOL_ERROR_CODES.NO_MATCHES,
          totalLines,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          hints: [
            ...getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'empty'),
            '',
            ...contextHints,
          ],
        };
      }

      resultContent = result.lines.join('\n');

      resultContent = applyMinification(resultContent, query.path);

      // Extract line numbers from matchRanges for response
      if (result.matchRanges.length > 0) {
        const firstRange = result.matchRanges[0];
        const lastRange = result.matchRanges[result.matchRanges.length - 1];
        if (firstRange && lastRange) {
          actualStartLine = firstRange.start;
          actualEndLine = lastRange.end;
          matchRanges = result.matchRanges;
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
          ...(actualStartLine !== undefined && {
            startLine: actualStartLine,
            endLine: actualEndLine,
            matchRanges,
          }),
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
          ...(actualStartLine !== undefined && {
            startLine: actualStartLine,
            endLine: actualEndLine,
            matchRanges,
          }),
          pagination: createPaginationInfo(autoPagination),
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          warnings: [
            `Auto-paginated: ${result.matchCount} matches exceeded display limit`,
          ],
          hints: [
            ...getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'hasResults'),
            ...generatePaginationHints(autoPagination, {
              toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
            }),
          ],
        };
      }

      isPartial = true;
    } else if (query.startLine !== undefined && query.endLine !== undefined) {
      // Line range extraction (aligned with GitHub's githubGetFileContent)
      const effectiveStartLine = Math.max(1, query.startLine);
      const effectiveEndLine = Math.min(query.endLine, totalLines);

      if (effectiveStartLine > totalLines) {
        return {
          status: 'empty',
          path: query.path,
          totalLines,
          errorCode: LOCAL_TOOL_ERROR_CODES.NO_MATCHES,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          hints: [
            ...getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'empty'),
            `Requested startLine ${query.startLine} exceeds file length (${totalLines} lines)`,
            `Use startLine=1 to ${totalLines} for valid range`,
          ],
        };
      }

      const selectedLines = lines.slice(
        effectiveStartLine - 1,
        effectiveEndLine
      );
      resultContent = selectedLines.join('\n');
      actualStartLine = effectiveStartLine;
      actualEndLine = effectiveEndLine;
      isPartial = true;

      // Warn if range was adjusted
      if (query.endLine > totalLines) {
        warnings.push(
          `Requested endLine ${query.endLine} adjusted to ${totalLines} (file end)`
        );
      }

      resultContent = applyMinification(resultContent, query.path);
    } else {
      resultContent = content;
      isPartial = false;

      resultContent = applyMinification(resultContent, query.path);
    }

    if (!resultContent || resultContent.trim().length === 0) {
      return {
        status: 'empty',
        path: query.path,
        totalLines,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'empty'),
      };
    }

    // Smart auto-pagination: Instead of error, auto-paginate large content
    let effectiveCharLength = query.charLength;
    let autoPaginated = false;

    if (!query.charLength && resultContent.length > DEFAULTS.MAX_OUTPUT_CHARS) {
      // Auto-apply recommended pagination instead of returning error
      effectiveCharLength = RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH;
      autoPaginated = true;
      warnings.push(
        `Auto-paginated: Content (${resultContent.length} chars) exceeds ${DEFAULTS.MAX_OUTPUT_CHARS} char limit`
      );
    }

    const pagination = applyPagination(
      resultContent,
      query.charOffset ?? 0,
      effectiveCharLength
    );

    const baseHints = getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'hasResults');
    // Generate pagination hints when explicitly requested OR when auto-paginated
    const paginationHints =
      effectiveCharLength || autoPaginated
        ? generatePaginationHints(pagination, {
            toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
          })
        : [];

    return {
      status: 'hasResults',
      path: query.path,
      cwd: process.cwd(),
      content: pagination.paginatedContent,
      contentLength: pagination.paginatedContent.length,
      isPartial,
      totalLines,
      // Line extraction info (when startLine/endLine or matchString used)
      ...(actualStartLine !== undefined &&
        actualEndLine !== undefined && {
          startLine: actualStartLine,
          endLine: actualEndLine,
          ...(matchRanges === undefined && {
            extractedLines: actualEndLine - actualStartLine + 1,
          }),
          ...(matchRanges !== undefined && { matchRanges }),
        }),
      // Include pagination info when explicitly requested OR auto-paginated
      ...((effectiveCharLength || autoPaginated) && {
        pagination: createPaginationInfo(pagination),
      }),
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      ...(warnings.length > 0 && { warnings }),
      hints: [...baseHints, ...paginationHints],
    };
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
      extra: { path: query.path },
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
    const matches =
      isRegex && regex
        ? regex.test(line)
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
  const firstMatchLine = matchesToProcess[0];
  if (firstMatchLine === undefined) {
    return { lines: [], matchRanges: [], matchCount: 0 };
  }

  let currentRange = {
    start: Math.max(1, firstMatchLine - contextLines),
    end: Math.min(lines.length, firstMatchLine + contextLines),
  };

  for (let i = 1; i < matchesToProcess.length; i++) {
    const matchLine = matchesToProcess[i];
    if (matchLine === undefined) continue;
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
      const prevRange = ranges[idx - 1];
      if (prevRange) {
        const omittedLines = range.start - prevRange.end - 1;
        if (omittedLines > 0) {
          resultLines.push('');
          resultLines.push(`... [${omittedLines} lines omitted] ...`);
          resultLines.push('');
        }
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
