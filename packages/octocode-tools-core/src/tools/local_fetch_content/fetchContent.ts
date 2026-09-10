import { contextUtils } from '../../utils/contextUtils.js';
import { countLines } from '../../utils/core/lines.js';
import { TOOL_NAMES } from '../toolMetadata/names.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import type { LocalFetchToolResult } from '@octocodeai/octocode-core/extra-types';
import type { FetchContentQuery } from '@octocodeai/octocode-core/schema';
import { attachRawResponseChars } from '../../utils/response/charSavings.js';
import { markdownHeadingOutlineToText } from '../../utils/markdownOutline.js';
import {
  validateExtractionOptions,
  getFileStatsOrError,
  resolveMinifyMode,
  shouldFailForLargeFile,
  createLargeFileErrorResult,
  createBinaryFileErrorResult,
  isLikelyBinaryFile,
  readFileContentOrError,
  withSourceSize,
} from './fetchContent/validation.js';
import { buildExtractionState } from './fetchContent/extraction.js';
import {
  buildSuccessResult,
  buildSymbolsSkeletonResult,
  withContentView,
  sanitizeReturnedText,
  buildSecurityLimitResult,
  type ContentView,
} from './fetchContent/pagination.js';

export async function fetchContent(
  query: FetchContentQuery
): Promise<LocalFetchToolResult> {
  try {
    const pathValidation = validateToolPath(
      query,
      TOOL_NAMES.LOCAL_FETCH_CONTENT
    );
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as LocalFetchToolResult;
    }

    const invalidExtractionResult = validateExtractionOptions(query);
    if (invalidExtractionResult) {
      return invalidExtractionResult;
    }

    const absolutePath = pathValidation.sanitizedPath;
    const queryPath = String(query.path);

    const { fileStats, errorResult: fileStatsError } =
      await getFileStatsOrError(query, absolutePath);
    if (fileStatsError || !fileStats) {
      return fileStatsError as LocalFetchToolResult;
    }

    const fileSizeBytes =
      typeof fileStats.size === 'bigint'
        ? Number(fileStats.size)
        : fileStats.size;
    const fileSizeKB = fileSizeBytes / 1024;
    if (await isLikelyBinaryFile(absolutePath)) {
      return attachRawResponseChars(
        createBinaryFileErrorResult(query, absolutePath),
        fileSizeBytes
      );
    }

    const minifyModeForGate = resolveMinifyMode(query);
    if (shouldFailForLargeFile(query, fileSizeKB, minifyModeForGate)) {
      return attachRawResponseChars(
        createLargeFileErrorResult(query, absolutePath, fileSizeKB),
        fileSizeBytes
      );
    }

    const { content: rawContent, errorResult: readError } =
      await readFileContentOrError(query, absolutePath);
    if (readError || rawContent === undefined) {
      return readError as LocalFetchToolResult;
    }

    // Source sizes describe the real file. Redaction runs after extraction
    // and before pagination, whose offsets describe the safe view.
    const sourceChars = rawContent.length;
    const sourceBytes = Buffer.byteLength(rawContent, 'utf-8');
    const content = rawContent;

    // Keep matched evidence intact when compact output was requested.
    const matchStringBlocksMinify =
      query.matchString !== undefined && minifyModeForGate !== 'none';
    const minifyMode = matchStringBlocksMinify ? 'none' : minifyModeForGate;
    const matchStringMinifyWarning =
      matchStringBlocksMinify && query.minify !== undefined
        ? `minify:"${query.minify}" is not applied to matchString extractions — matched slices are returned verbatim so the content always contains the matched text.`
        : undefined;
    const shouldMinify = minifyMode === 'standard' || minifyMode === 'symbols';
    const fallbackContentView: ContentView = shouldMinify ? 'standard' : 'none';

    let signaturesSkippedWarning: string | undefined;
    if (minifyMode === 'symbols') {
      const sigs = contextUtils.extractSignatures(content, queryPath);
      if (sigs === null) {
        const markdownOutline = markdownHeadingOutlineToText(
          content,
          queryPath
        );
        if (markdownOutline !== null) {
          const sanitized = sanitizeReturnedText(markdownOutline, queryPath);
          if (sanitized.limited) {
            return withSourceSize(
              buildSecurityLimitResult(query, countLines(content)),
              sourceChars,
              sourceBytes
            );
          }
          return attachRawResponseChars(
            await buildSymbolsSkeletonResult(
              query,
              sanitized.text,
              countLines(content),
              sourceChars,
              sourceBytes,
              sanitized.warning
            ),
            sourceChars
          );
        }
        signaturesSkippedWarning = `No smaller outline is available for ${queryPath}; using the standard content view. The outline may be unsupported, oversized, or unavailable for this source.`;
      }
      if (sigs !== null) {
        const totalLinesOrig = countLines(content);
        const sigsProcessed = contextUtils.applyContentViewMinification(
          sigs,
          queryPath
        );
        const sanitized = sanitizeReturnedText(sigsProcessed, queryPath);
        if (sanitized.limited) {
          return withSourceSize(
            buildSecurityLimitResult(query, totalLinesOrig),
            sourceChars,
            sourceBytes
          );
        }

        return attachRawResponseChars(
          await buildSymbolsSkeletonResult(
            query,
            sanitized.text,
            totalLinesOrig,
            sourceChars,
            sourceBytes,
            sanitized.warning
          ),
          sourceChars
        );
      }
    }

    const totalLines = countLines(content);
    const extraction = buildExtractionState(query, content);

    // Sanitize early empty results through the same security boundary.
    const withSanitizedContent = (
      r: LocalFetchToolResult
    ): LocalFetchToolResult => {
      const text = (r as { content?: unknown }).content;
      if (typeof text !== 'string') return r;
      const sanitized = sanitizeReturnedText(text, queryPath);
      const appended = [
        ...(signaturesSkippedWarning ? [signaturesSkippedWarning] : []),
        ...(matchStringMinifyWarning ? [matchStringMinifyWarning] : []),
        ...(sanitized.warning ? [sanitized.warning] : []),
      ];
      const existing = (r as { warnings?: string[] }).warnings ?? [];
      return {
        ...r,
        ...(signaturesSkippedWarning || matchStringMinifyWarning
          ? {
              minifyFallback: {
                requested: query.minify ?? 'none',
                applied: r.contentView ?? fallbackContentView,
                reason: matchStringBlocksMinify
                  ? ('match-evidence' as const)
                  : ('outline-unavailable' as const),
              },
            }
          : {}),
        content: sanitized.text,
        returnedChars: sanitized.text.length,
        ...(appended.length > 0 && { warnings: [...existing, ...appended] }),
      };
    };

    if (extraction.earlyResult) {
      const earlyContent = (extraction.earlyResult as { content?: string })
        .content;
      const minifiedEarlyResult =
        shouldMinify && typeof earlyContent === 'string'
          ? {
              ...extraction.earlyResult,
              content: contextUtils.applyContentViewMinification(
                earlyContent,
                queryPath
              ),
            }
          : extraction.earlyResult;
      return attachRawResponseChars(
        withSourceSize(
          withSanitizedContent(
            withContentView(minifiedEarlyResult, fallbackContentView)
          ),
          sourceChars,
          sourceBytes
        ),
        sourceChars
      );
    }

    const fullResult = await buildSuccessResult(
      query,
      extraction,
      fileStats,
      totalLines,
      shouldMinify,
      fallbackContentView
    );
    return attachRawResponseChars(
      withSourceSize(
        {
          ...fullResult,
          ...(signaturesSkippedWarning || matchStringMinifyWarning
            ? {
                minifyFallback: {
                  requested: query.minify ?? 'none',
                  applied: fullResult.contentView ?? fallbackContentView,
                  reason: matchStringBlocksMinify
                    ? 'match-evidence'
                    : 'outline-unavailable',
                },
              }
            : {}),
          ...((signaturesSkippedWarning || matchStringMinifyWarning) && {
            warnings: [
              ...((fullResult as { warnings?: string[] }).warnings ?? []),
              ...(signaturesSkippedWarning ? [signaturesSkippedWarning] : []),
              ...(matchStringMinifyWarning ? [matchStringMinifyWarning] : []),
            ],
          }),
        },
        sourceChars,
        sourceBytes
      ),
      sourceChars
    );
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT,
    }) as LocalFetchToolResult;
  }
}
