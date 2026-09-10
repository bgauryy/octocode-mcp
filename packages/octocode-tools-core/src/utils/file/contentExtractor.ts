import { selectMatchingBytes } from './byteMatchSelection.js';
import { contextUtils } from '../contextUtils.js';
import type { ExtractMatchingLinesOptions } from '@octocodeai/octocode-engine';

export function extractMatchingLines(
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
  matchingLines: number[];
} {
  if (isRegex) {
    try {
      new RegExp(pattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid regex pattern: ${message}`, { cause: error });
    }
  }

  if (maxMatches !== undefined && maxMatches <= 0) {
    return {
      lines: [],
      matchRanges: [],
      matchCount: 0,
      matchingLines: [],
    };
  }

  const content = lines.join('\n');

  const options: ExtractMatchingLinesOptions = {
    isRegex,
    caseSensitive,
    contextLines,
    maxMatches,
  };

  const result = contextUtils.extractMatchingLines(content, pattern, options);

  return {
    lines: result.lines,
    matchRanges: result.matchRanges.map(r => ({ start: r.start, end: r.end })),
    matchCount: result.matchCount,
    matchingLines: result.matchingLines.map(n => n),
  };
}

export function selectMatchingSource(
  content: string,
  pattern: string,
  contextLines: number,
  isRegex = false,
  caseSensitive = false,
  contextBytes?: number,
  filePath?: string
) {
  if (contextBytes !== undefined)
    return selectMatchingBytes(
      content,
      pattern,
      contextBytes,
      isRegex,
      caseSensitive,
      filePath
    );
  const records = content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const result = extractMatchingLines(
    records.map(line => line.replace(/\r?\n$/, '')),
    pattern,
    contextLines,
    isRegex,
    caseSensitive
  );
  const sourceLines = [
    ...new Set(
      result.matchRanges.flatMap(range =>
        Array.from(
          { length: Math.min(range.end, records.length) - range.start + 1 },
          (_, i) => range.start + i
        )
      )
    ),
  ];
  return {
    ...result,
    securityLimited: false,
    warnings: [] as string[],
    sourceLines,
    content: sourceLines.map(line => records[line - 1] ?? '').join(''),
  };
}
