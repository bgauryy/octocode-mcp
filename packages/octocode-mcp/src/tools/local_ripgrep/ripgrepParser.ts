import type { RipgrepQuery } from './scheme.js';
import type {
  RipgrepFileMatches,
  SearchStats,
} from '../../utils/core/types.js';
import {
  parseRipgrepJson,
  parseGrepOutput,
} from '../../utils/parsers/ripgrep.js';

/**
 * Parse ripgrep plain text output (filesOnly or filesWithoutMatch mode).
 * When using -l (--files-with-matches) or --files-without-match flags,
 * ripgrep outputs one filename per line instead of JSON.
 *
 * @param stdout - Plain text output from ripgrep (one filename per line)
 * @returns Array of file matches with path only (no match details)
 */
export function parseFilesOnlyOutput(stdout: string): RipgrepFileMatches[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  return lines.map(path => ({
    path,
    matchCount: 1, // At least one match exists (that's why file is listed)
    matches: [], // No match details in plain text mode
  }));
}

/**
 * Parse ripgrep output (JSON or plain text)
 */
export function parseRipgrepOutput(
  stdout: string,
  configuredQuery: RipgrepQuery
): {
  files: RipgrepFileMatches[];
  stats: SearchStats;
} {
  const isPlainTextOutput =
    configuredQuery.filesOnly || configuredQuery.filesWithoutMatch;

  if (isPlainTextOutput) {
    // Plain text output: one filename per line (no JSON)
    return {
      files: parseFilesOnlyOutput(stdout),
      stats: {},
    };
  } else {
    // JSON output: structured match data with line numbers, columns, etc.
    return parseRipgrepJson(stdout, configuredQuery);
  }
}

/**
 * Parse grep output
 */
export function parseGrepOutputWrapper(
  stdout: string,
  configuredQuery: RipgrepQuery
): RipgrepFileMatches[] {
  return parseGrepOutput(stdout, configuredQuery);
}
