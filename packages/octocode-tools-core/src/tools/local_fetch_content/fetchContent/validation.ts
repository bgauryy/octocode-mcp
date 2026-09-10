import { open, readFile, stat } from 'fs/promises';
import { RESOURCE_LIMITS } from '../../../utils/core/constants.js';
import { TOOL_NAMES } from '../../toolMetadata/names.js';
import { createErrorResult } from '../../../utils/file/toolHelpers.js';
import type { LocalFetchToolResult } from '@octocodeai/octocode-core/extra-types';
import type { FetchContentQuery } from '@octocodeai/octocode-core/schema';
import { ToolErrors } from '../../../errors/errorFactories.js';
import { LOCAL_TOOL_ERROR_CODES } from '../../../errors/localToolErrors.js';
import { buildNextPageContinuation } from '../../../scheme/pagination.js';
import { fallbackOnBestEffortFailure } from '../../../utils/core/bestEffort.js';

export type FileStats = NonNullable<Awaited<ReturnType<typeof stat>>>;

export function sourceSizeFields(sourceChars: number, sourceBytes: number) {
  return { sourceChars, sourceBytes };
}

export function withSourceSize(
  result: LocalFetchToolResult,
  sourceChars: number,
  sourceBytes: number
): LocalFetchToolResult {
  return {
    ...result,
    ...sourceSizeFields(sourceChars, sourceBytes),
  };
}

export function validateExtractionOptions(
  query: FetchContentQuery
): LocalFetchToolResult | null {
  const hasFullContent = query.fullContent === true;
  const hasMatchString = query.matchString !== undefined;
  const hasLineRange =
    query.startLine !== undefined || query.endLine !== undefined;

  // minify:"symbols" returns a whole-file signature skeleton, so it cannot honour
  // a line/match sub-selection. Reject the combination instead of silently
  // ignoring the constraint (the skeleton path returns before extraction runs).
  if (query.minify === 'symbols' && (hasMatchString || hasLineRange)) {
    return {
      status: 'error',
      error:
        'minify:"symbols" returns a whole-file signature skeleton and cannot be combined with matchString/startLine/endLine — remove the line/match constraints, or use minify:"standard" (or "none") to extract a specific range.',
    };
  }

  if (hasFullContent && hasMatchString) {
    const result: LocalFetchToolResult = {
      status: 'error',
      error:
        'Cannot use fullContent with matchString — these are mutually exclusive extraction methods. Choose ONE: fullContent=true to read the entire file, OR matchString to extract matching sections, OR startLine+endLine for a known line range.',
    };
    return result;
  }

  if (hasFullContent && hasLineRange) {
    const result: LocalFetchToolResult = {
      status: 'error',
      error:
        'Cannot use fullContent with startLine/endLine — these are mutually exclusive extraction methods. Choose ONE: fullContent=true to read the entire file, OR startLine+endLine for a known line range, OR matchString to extract matching sections.',
    };
    return result;
  }

  if (hasMatchString && hasLineRange) {
    const result: LocalFetchToolResult = {
      status: 'error',
      error:
        'Cannot use matchString with startLine/endLine — these are mutually exclusive extraction methods. Choose ONE: matchString to extract matching sections, OR startLine+endLine for a known line range, OR fullContent=true to read the entire file.',
    };
    return result;
  }

  const hasStartLine = query.startLine !== undefined;
  const hasEndLine = query.endLine !== undefined;
  if (hasStartLine && !hasEndLine) {
    return {
      status: 'error',
      error: `startLine=${query.startLine} provided without endLine — both are required for line-range extraction.`,
    };
  }
  if (hasEndLine && !hasStartLine) {
    return {
      status: 'error',
      error: `endLine=${query.endLine} provided without startLine — both are required for line-range extraction.`,
    };
  }

  return null;
}

export async function getFileStatsOrError(
  query: FetchContentQuery,
  absolutePath: string
): Promise<{
  fileStats?: FileStats;
  errorResult?: LocalFetchToolResult;
}> {
  try {
    return {
      fileStats: await stat(absolutePath),
    };
  } catch (error) {
    const toolError = ToolErrors.fileAccessFailed(
      query.path!,
      error instanceof Error ? error : undefined
    );

    return {
      errorResult: createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
        extra: {
          resolvedPath: absolutePath,
        },
      }) as LocalFetchToolResult,
    };
  }
}

/** Exact content is the default; compact views require an explicit request. */
export function resolveMinifyMode(
  query: FetchContentQuery
): 'none' | 'standard' | 'symbols' {
  return query.minify ?? 'none';
}

export function shouldFailForLargeFile(
  query: FetchContentQuery,
  fileSizeKB: number,
  minifyMode: 'none' | 'standard' | 'symbols'
): boolean {
  // Bounded reads are scanned and paginated after selection.
  if (minifyMode !== 'none') {
    return false;
  }
  return (
    fileSizeKB > RESOURCE_LIMITS.LARGE_FILE_THRESHOLD_KB &&
    !query.matchString &&
    !query.startLine &&
    query.fullContent === true
  );
}

export function createLargeFileErrorResult(
  query: FetchContentQuery,
  absolutePath: string,
  fileSizeKB: number
): LocalFetchToolResult {
  const toolError = ToolErrors.fileTooLarge(
    query.path!,
    fileSizeKB,
    RESOURCE_LIMITS.LARGE_FILE_THRESHOLD_KB
  );

  const { fullContent: _fullContent, ...selection } = query;
  return {
    ...createErrorResult(toolError, query, {
      toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
      extra: { resolvedPath: absolutePath },
    }),
    sourceBytes: fileSizeKB * 1024,
    isPartial: true,
    partialReasons: ['full-content-source-size-limit'],
    metadataUnavailable: ['totalLines'],
    next: {
      continue: buildNextPageContinuation('localFetch', {
        ...selection,
        chunkType: 'lines',
        offset: 0,
        limit: 100,
      }),
    },
  } as LocalFetchToolResult;
}

export function createBinaryFileErrorResult(
  query: FetchContentQuery,
  absolutePath: string
): LocalFetchToolResult {
  const toolError = ToolErrors.binaryFileUnsupported(query.path!);

  return createErrorResult(toolError, query, {
    toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
    extra: { resolvedPath: absolutePath },
  }) as LocalFetchToolResult;
}

export async function isLikelyBinaryFile(filePath: string): Promise<boolean> {
  const sampleSize = 8192;
  const buffer = Buffer.alloc(sampleSize);
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await open(filePath, 'r');
    const { bytesRead } = await handle.read(buffer, 0, sampleSize, 0);
    if (bytesRead === 0) {
      return false;
    }

    const sample = buffer.subarray(0, bytesRead);
    if (sample.includes(0)) {
      return true;
    }

    try {
      // Streaming mode accepts an incomplete final code point at the sample
      // boundary while still rejecting malformed UTF-8 inside the sample.
      new TextDecoder('utf-8', { fatal: true }).decode(sample, {
        stream: true,
      });
    } catch {
      return true;
    }

    let strippedLength = 0;
    let controlBytes = 0;
    let index = 0;
    while (index < sample.length) {
      const byte = sample[index]!;

      if (
        byte === 0x1b &&
        index + 1 < sample.length &&
        sample[index + 1] === 0x5b
      ) {
        index += 2;
        while (
          index < sample.length &&
          (sample[index]! < 0x40 || sample[index]! > 0x7e)
        ) {
          index += 1;
        }
        index += 1;
        continue;
      }

      strippedLength += 1;
      const allowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
      if (byte < 0x20 && !allowedControl) {
        controlBytes += 1;
      }
      index += 1;
    }

    return strippedLength > 0 && controlBytes / strippedLength > 0.05;
  } catch {
    return false;
  } finally {
    await handle
      ?.close()
      .catch(
        fallbackOnBestEffortFailure('binary sample handle close', undefined)
      );
  }
}

export async function readFileContentOrError(
  query: FetchContentQuery,
  absolutePath: string
): Promise<{ content?: string; errorResult?: LocalFetchToolResult }> {
  try {
    return {
      content: new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(await readFile(absolutePath)),
    };
  } catch (error) {
    const cause = error instanceof Error ? error : undefined;
    const causeCode = (cause as (Error & { code?: string }) | undefined)?.code;
    const toolError =
      causeCode === 'EISDIR'
        ? ToolErrors.fileAccessFailed(query.path!, cause)
        : ToolErrors.fileReadFailed(query.path!, cause);

    return {
      errorResult: createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
        extra: { resolvedPath: absolutePath },
      }) as LocalFetchToolResult,
    };
  }
}

export function createNoMatchesResult(
  query: FetchContentQuery,
  totalLines: number
): LocalFetchToolResult {
  return {
    path: query.path,
    status: 'empty',
    content: '',
    returnedBytes: 0,
    returnedLines: 0,
    matchedLines: [],
    selectedMatchCount: 0,
    errorCode: LOCAL_TOOL_ERROR_CODES.NO_MATCHES,
    totalLines,
  };
}
