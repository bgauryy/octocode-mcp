import { readFile, stat } from 'fs/promises';
import { getConfigSync } from 'octocode-shared';
import { getHints } from '../../hints/index.js';
import { applyMinification } from './contentMinifier.js';
import { extractMatchingLines } from './contentExtractor.js';
import {
  applyPagination,
  createPaginationInfo,
} from '../../utils/pagination/core.js';
import { generatePaginationHints } from '../../utils/pagination/hints.js';
import { RESOURCE_LIMITS } from '../../utils/core/constants.js';
import { TOOL_NAMES } from '@octocodeai/octocode-core';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import type {
  FetchContentQuery,
  FetchContentResult,
} from '../../utils/core/types.js';
import { ToolErrors } from '../../errors/errorFactories.js';
import { LOCAL_TOOL_ERROR_CODES } from '../../errors/localToolErrors.js';

const DEFAULT_OUTPUT_CHAR_LENGTH = 8000;
const MAX_MATCH_LINES = 50;

type FileStats = Awaited<ReturnType<typeof stat>>;

interface ExtractionState {
  resultContent?: string;
  isPartial: boolean;
  actualStartLine?: number;
  actualEndLine?: number;
  matchRanges?: Array<{ start: number; end: number }>;
  warnings: string[];
  earlyResult?: FetchContentResult;
}

function readConfiguredDefaultCharLength(): number {
  const config = getConfigSync() as {
    output?: {
      pagination?: {
        defaultCharLength?: number;
      };
    };
  };

  return (
    config.output?.pagination?.defaultCharLength ?? DEFAULT_OUTPUT_CHAR_LENGTH
  );
}

function getDefaultOutputCharLengthSafe(): number {
  try {
    return readConfiguredDefaultCharLength();
  } catch {
    return DEFAULT_OUTPUT_CHAR_LENGTH;
  }
}

function validateExtractionOptions(
  query: FetchContentQuery
): FetchContentResult | null {
  if (query.fullContent === true && query.matchString !== undefined) {
    return {
      status: 'error',
      error:
        'Cannot use fullContent with matchString — these are mutually exclusive extraction methods. Choose ONE: fullContent=true to read the entire file, OR matchString to extract matching sections.',
      hints: [
        'fullContent and matchString are mutually exclusive — pick one extraction method',
        'Use fullContent=true to read the entire file (small files only)',
        'Use matchString="pattern" to extract specific sections (recommended for large files)',
        'TIP: matchString is more token-efficient — prefer it when you know what to look for',
      ],
    } as FetchContentResult;
  }

  return null;
}

async function getFileStatsOrError(
  query: FetchContentQuery,
  absolutePath: string
): Promise<{ fileStats?: FileStats; errorResult?: FetchContentResult }> {
  try {
    return {
      fileStats: await stat(absolutePath),
    };
  } catch (error) {
    const toolError = ToolErrors.fileAccessFailed(
      query.path,
      error instanceof Error ? error : undefined
    );

    return {
      errorResult: createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
        extra: {
          resolvedPath: absolutePath,
        },
      }) as FetchContentResult,
    };
  }
}

function shouldFailForLargeFile(
  query: FetchContentQuery,
  fileSizeKB: number
): boolean {
  return (
    fileSizeKB > RESOURCE_LIMITS.LARGE_FILE_THRESHOLD_KB &&
    !query.charLength &&
    !query.matchString &&
    !query.startLine
  );
}

function createLargeFileErrorResult(
  query: FetchContentQuery,
  absolutePath: string,
  fileSizeKB: number
): FetchContentResult {
  const toolError = ToolErrors.fileTooLarge(
    query.path,
    fileSizeKB,
    RESOURCE_LIMITS.LARGE_FILE_THRESHOLD_KB
  );

  return createErrorResult(toolError, query, {
    toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
    extra: { resolvedPath: absolutePath },
    customHints: [
      'Best approach: Use matchString to extract specific functions/classes you actually need',
      'Alternative: Use charLength for pagination if you need to browse through the file systematically',
      'Why matchString works better: Gets only relevant sections, faster, and uses fewer tokens',
      'Critical: fullContent without charLength will fail on large files - always specify a reading strategy',
    ],
  }) as FetchContentResult;
}

async function readFileContentOrError(
  query: FetchContentQuery,
  absolutePath: string
): Promise<{ content?: string; errorResult?: FetchContentResult }> {
  try {
    return {
      content: await readFile(absolutePath, 'utf-8'),
    };
  } catch (error) {
    const toolError = ToolErrors.fileReadFailed(
      query.path,
      error instanceof Error ? error : undefined
    );

    return {
      errorResult: createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
        extra: { resolvedPath: absolutePath },
      }) as FetchContentResult,
    };
  }
}

function createNoMatchesResult(
  query: FetchContentQuery,
  totalLines: number
): FetchContentResult {
  const contextHints = [
    `Searched ${totalLines} line${totalLines === 1 ? '' : 's'} - no matches found`,
  ];

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
    errorCode: LOCAL_TOOL_ERROR_CODES.NO_MATCHES,
    totalLines,
    hints: [
      ...getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'empty'),
      '',
      ...contextHints,
    ],
  };
}

function buildMatchExtractionState(
  query: FetchContentQuery,
  lines: string[],
  totalLines: number,
  defaultOutputCharLength: number
): ExtractionState {
  const result = extractMatchingLines(
    lines,
    query.matchString!,
    query.matchStringContextLines ?? 5,
    query.matchStringIsRegex ?? false,
    query.matchStringCaseSensitive ?? false,
    MAX_MATCH_LINES
  );

  if (result.lines.length === 0) {
    return {
      isPartial: false,
      warnings: [],
      earlyResult: createNoMatchesResult(query, totalLines),
    };
  }

  const resultContent = applyMinification(result.lines.join('\n'), query.path);
  let actualStartLine: number | undefined;
  let actualEndLine: number | undefined;
  let matchRanges: Array<{ start: number; end: number }> | undefined;

  if (result.matchRanges.length > 0) {
    const firstRange = result.matchRanges[0];
    const lastRange = result.matchRanges[result.matchRanges.length - 1];
    if (firstRange && lastRange) {
      actualStartLine = firstRange.start;
      actualEndLine = lastRange.end;
      matchRanges = result.matchRanges;
    }
  }

  if (result.matchCount > MAX_MATCH_LINES) {
    return {
      isPartial: true,
      warnings: [],
      earlyResult: {
        status: 'hasResults',
        content: resultContent,
        isPartial: true,
        totalLines,
        ...(actualStartLine !== undefined && {
          startLine: actualStartLine,
          endLine: actualEndLine,
          matchRanges,
        }),
        warnings: [
          `Pattern matched ${result.matchCount} lines. Truncated to first ${MAX_MATCH_LINES} matches.`,
        ],
        hints: [
          `Pattern matched ${result.matchCount} lines - likely too generic`,
          'Make the pattern more specific to target only what you need',
          'TIP: Use charLength to paginate if you need all matches',
        ],
      },
    };
  }

  if (!query.charLength && resultContent.length > defaultOutputCharLength) {
    const autoPagination = applyPagination(
      resultContent,
      0,
      defaultOutputCharLength
    );
    return {
      isPartial: true,
      warnings: [],
      earlyResult: {
        status: 'hasResults',
        content: autoPagination.paginatedContent,
        isPartial: true,
        totalLines,
        ...(actualStartLine !== undefined && {
          startLine: actualStartLine,
          endLine: actualEndLine,
          matchRanges,
        }),
        pagination: createPaginationInfo(autoPagination),
        warnings: [
          `Auto-paginated: ${result.matchCount} matches exceeded display limit`,
        ],
        hints: [
          ...getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'hasResults'),
          ...generatePaginationHints(autoPagination, {
            toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
          }),
        ],
      },
    };
  }

  return {
    resultContent,
    isPartial: true,
    actualStartLine,
    actualEndLine,
    matchRanges,
    warnings: [],
  };
}

function hasLineRangeRequest(query: FetchContentQuery): boolean {
  return query.startLine !== undefined && query.endLine !== undefined;
}

function buildLineRangeExtractionState(
  query: FetchContentQuery,
  lines: string[],
  totalLines: number
): ExtractionState {
  const requestedStartLine = query.startLine!;
  const requestedEndLine = query.endLine!;
  const effectiveStartLine = Math.max(1, requestedStartLine);
  const effectiveEndLine = Math.min(requestedEndLine, totalLines);

  if (effectiveStartLine > totalLines) {
    return {
      isPartial: false,
      warnings: [],
      earlyResult: {
        status: 'empty',
        totalLines,
        errorCode: LOCAL_TOOL_ERROR_CODES.NO_MATCHES,
        hints: [
          ...getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'empty'),
          `Requested startLine ${requestedStartLine} exceeds file length (${totalLines} lines)`,
          `Use startLine=1 to ${totalLines} for valid range`,
        ],
      },
    };
  }

  const warnings: string[] = [];
  if (requestedEndLine > totalLines) {
    warnings.push(
      `Requested endLine ${requestedEndLine} adjusted to ${totalLines} (file end)`
    );
  }

  return {
    resultContent: lines
      .slice(effectiveStartLine - 1, effectiveEndLine)
      .join('\n'),
    isPartial: true,
    actualStartLine: effectiveStartLine,
    actualEndLine: effectiveEndLine,
    warnings,
  };
}

function buildExtractionState(
  query: FetchContentQuery,
  content: string,
  defaultOutputCharLength: number
): ExtractionState {
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (query.matchString) {
    return buildMatchExtractionState(
      query,
      lines,
      totalLines,
      defaultOutputCharLength
    );
  }

  if (hasLineRangeRequest(query)) {
    return buildLineRangeExtractionState(query, lines, totalLines);
  }

  return {
    resultContent: content,
    isPartial: false,
    warnings: [],
  };
}

function buildSuccessResult(
  query: FetchContentQuery,
  extraction: ExtractionState,
  fileStats: FileStats,
  totalLines: number,
  defaultOutputCharLength: number
): FetchContentResult {
  if (
    !extraction.resultContent ||
    extraction.resultContent.trim().length === 0
  ) {
    return {
      status: 'empty',
      totalLines,
      hints: getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'empty'),
    };
  }

  const warnings = [...extraction.warnings];
  let effectiveCharLength = query.charLength;
  let autoPaginated = false;

  if (
    !query.charLength &&
    extraction.resultContent.length > defaultOutputCharLength
  ) {
    effectiveCharLength = defaultOutputCharLength;
    autoPaginated = true;
    warnings.push(
      `Auto-paginated: Content (${extraction.resultContent.length} chars) exceeds ${defaultOutputCharLength} char limit`
    );
  }

  const pagination = applyPagination(
    extraction.resultContent,
    query.charOffset ?? 0,
    effectiveCharLength
  );

  const hasMoreContent =
    extraction.isPartial ||
    pagination.hasMore ||
    (extraction.actualEndLine !== undefined &&
      extraction.actualEndLine < totalLines);

  const baseHints = getHints(TOOL_NAMES.LOCAL_FETCH_CONTENT, 'hasResults', {
    hasMoreContent,
    isPartial: extraction.isPartial,
    endLine: extraction.actualEndLine,
    totalLines,
    nextCharOffset: pagination.nextCharOffset,
    totalChars: pagination.totalChars,
  });

  const paginationHints =
    effectiveCharLength || autoPaginated
      ? generatePaginationHints(pagination, {
          toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
        })
      : [];

  return {
    status: 'hasResults',
    content: pagination.paginatedContent,
    isPartial: extraction.isPartial,
    totalLines,
    ...(extraction.actualStartLine !== undefined &&
      extraction.actualEndLine !== undefined && {
        startLine: extraction.actualStartLine,
        endLine: extraction.actualEndLine,
        ...(extraction.matchRanges !== undefined && {
          matchRanges: extraction.matchRanges,
        }),
      }),
    ...(fileStats.mtime && { modified: fileStats.mtime.toISOString() }),
    ...((effectiveCharLength || autoPaginated) && {
      pagination: createPaginationInfo(pagination),
    }),
    ...(warnings.length > 0 && { warnings }),
    hints: [...baseHints, ...paginationHints],
  };
}

export async function fetchContent(
  query: FetchContentQuery
): Promise<FetchContentResult> {
  const defaultOutputCharLength = getDefaultOutputCharLengthSafe();

  try {
    const pathValidation = validateToolPath(
      query,
      TOOL_NAMES.LOCAL_FETCH_CONTENT
    );
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as FetchContentResult;
    }

    const invalidExtractionResult = validateExtractionOptions(query);
    if (invalidExtractionResult) {
      return invalidExtractionResult;
    }

    const absolutePath = pathValidation.sanitizedPath!;

    const { fileStats, errorResult: fileStatsError } =
      await getFileStatsOrError(query, absolutePath);
    if (fileStatsError || !fileStats) {
      return fileStatsError as FetchContentResult;
    }

    const fileSizeBytes =
      typeof fileStats.size === 'bigint'
        ? Number(fileStats.size)
        : fileStats.size;
    const fileSizeKB = fileSizeBytes / 1024;
    if (shouldFailForLargeFile(query, fileSizeKB)) {
      return createLargeFileErrorResult(query, absolutePath, fileSizeKB);
    }

    const { content, errorResult: readError } = await readFileContentOrError(
      query,
      absolutePath
    );
    if (readError || content === undefined) {
      return readError as FetchContentResult;
    }

    const totalLines = content.split('\n').length;
    const extraction = buildExtractionState(
      query,
      content,
      defaultOutputCharLength
    );

    if (extraction.earlyResult) {
      return extraction.earlyResult;
    }

    return buildSuccessResult(
      query,
      extraction,
      fileStats,
      totalLines,
      defaultOutputCharLength
    );
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
    }) as FetchContentResult;
  }
}
