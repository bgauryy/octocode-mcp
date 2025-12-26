/**
 * Zod schema for localSearchCode tool
 * Optimized ripgrep implementation with performance enhancements
 */

import { z } from 'zod';
import {
  BaseQuerySchemaLocal,
  createBulkQuerySchemaLocal,
  COMMON_PAGINATION_DESCRIPTIONS,
} from './baseSchema.js';
import { TOOL_NAMES } from '../utils/constants.js';

/**
 * Tool description for MCP registration
 */
export const LOCAL_RIPGREP_DESCRIPTION = `Purpose: Fast pattern/code search with structured matches and byte offsets.

Use when: You know a pattern; need paths + limited context.
Avoid when: Only name/time filters (use find_files).
Workflow:
- Discovery: filesOnly=true, add type/include/excludeDir → inspect → refine
- Targeted: small matchesPerPage; use location.charOffset with fetch_content
Output: files[{path, matchCount, matches?, modified, pagination}], totals.
Notes: Offsets are bytes; fetch_content uses the same.
Tips: Prefer type/include filters; smartCase=true; perlRegex for lookaheads; fixedString for literals; multiline is slow.

IMPORTANT: ripgrep respects .gitignore by default. To search node_modules, use noIgnore=true.

Examples:
- pattern: "export function", type: "ts", filesOnly: true
- pattern: "AuthService", include: ["*.{ts,tsx}"], excludeDir: ["node_modules"], matchesPerPage: 5
- pattern: "useEffect(", smartCase: true
- pattern: "express", path: "node_modules/express", noIgnore: true (search inside node_modules)
`;

/**
 * Ripgrep search content query schema
 * Optimized based on performance research
 */
export const RipgrepQuerySchema = BaseQuerySchemaLocal.extend({
  // REQUIRED FIELDS
  pattern: z
    .string()
    .min(1)
    .describe('Pattern or regex to search (use fixedString for literals)'),
  path: z.string().describe('Root directory to search'),

  // WORKFLOW MODE (recommended presets)
  mode: z
    .enum(['discovery', 'paginated', 'detailed'])
    .optional()
    .describe(
      'Search workflow:\n' +
        '- discovery: filesOnly=true (fast)\n' +
        '- paginated: charLength=10000, maxMatchesPerFile=3\n' +
        '- detailed: contextLines=3, charLength=10000\n' +
        'Manual params override mode.'
    ),

  // PATTERN MODES (mutually exclusive - validated at runtime)
  fixedString: z
    .boolean()
    .optional()
    .describe('Treat pattern as literal (fast; -F). No regex interpretation.'),
  perlRegex: z
    .boolean()
    .optional()
    .describe('Use PCRE2 (lookahead, backrefs, named groups).'),

  // CASE SENSITIVITY (smart case recommended)
  smartCase: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Smart case: lowercase=insensitive, mixed=case-sensitive (default).'
    ),
  caseInsensitive: z
    .boolean()
    .optional()
    .describe('Always case-insensitive (overrides smartCase).'),
  caseSensitive: z
    .boolean()
    .optional()
    .describe('Always case-sensitive (overrides smartCase/caseInsensitive).'),

  // MATCH BEHAVIOR
  wholeWord: z
    .boolean()
    .optional()
    .describe('Match whole words only (equivalent to \\b boundaries)'),
  invertMatch: z
    .boolean()
    .optional()
    .describe("Invert matching: show lines that DON'T match"),

  // FILE FILTERING (optimized strategies)
  type: z
    .string()
    .optional()
    .describe(
      'File type filter (ts, js, py, rust…). Prefer over globs. See rg --type-list.'
    ),
  include: z
    .array(z.string())
    .optional()
    .describe('Include globs. Prefer ["*.{ts,tsx}"] over separate globs.'),
  exclude: z
    .array(z.string())
    .optional()
    .describe('Exclude globs (e.g., ["*.test.*","*.spec.*"]).'),
  excludeDir: z
    .array(z.string())
    .optional()
    .describe('Exclude dirs (e.g., ["node_modules",".git","dist"]).'),

  // IGNORE CONTROL (gitignore behavior)
  // NOTE: ripgrep respects .gitignore by default. To search node_modules, use noIgnore=true
  noIgnore: z
    .boolean()
    .optional()
    .describe(
      'Ignore .gitignore (search everything). REQUIRED for searching node_modules since it is typically in .gitignore.'
    ),
  hidden: z
    .boolean()
    .optional()
    .describe('Search hidden files and directories.'),
  followSymlinks: z
    .boolean()
    .optional()
    .describe('Follow symbolic links (default false for security).'),

  // OUTPUT CONTROL (critical for performance)
  filesOnly: z
    .boolean()
    .optional()
    .describe('List matching files only (best for discovery).'),
  filesWithoutMatch: z
    .boolean()
    .optional()
    .describe('List files WITHOUT matches (inverse of filesOnly).'),
  count: z
    .boolean()
    .optional()
    .describe('Count matches per file ("file:count").'),
  countMatches: z
    .boolean()
    .optional()
    .describe('Count total matches across occurrences (vs per-line count).'),

  // CONTEXT & LINE CONTROL (semantic: defines WHAT to extract)
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe(
      'Context lines around matches (0–50). Large values increase output; prefer charLength for pagination.'
    ),
  beforeContext: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe('Lines before match (0–50).'),
  afterContext: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe('Lines after match (0–50).'),
  matchContentLength: z
    .number()
    .int()
    .min(1)
    .max(800)
    .optional()
    .default(200)
    .describe('Max chars per match (1–800, default 200). Controls truncation.'),
  lineNumbers: z
    .boolean()
    .optional()
    .default(true)
    .describe('Show line numbers (default: true)'),
  column: z.boolean().optional().describe('Show column numbers.'),

  // MATCH LIMITING (prevents output explosion)
  maxMatchesPerFile: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Max matches per file (legacy; prefer matchesPerPage).'),
  maxFiles: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Max files to search (1–1000).'),

  // TWO-LEVEL PAGINATION (file-level + per-file matches)
  filesPerPage: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe(COMMON_PAGINATION_DESCRIPTIONS.filesPerPage),
  filePageNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(COMMON_PAGINATION_DESCRIPTIONS.filePageNumber),
  matchesPerPage: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe('Matches per file (default 10, max 100).'),

  // ADVANCED FEATURES (use with caution)
  multiline: z
    .boolean()
    .optional()
    .describe(
      'Enable multiline (slow, memory-heavy). Use only if pattern spans lines.'
    ),
  multilineDotall: z
    .boolean()
    .optional()
    .describe('Make . match newlines (use with multiline=true).'),
  binaryFiles: z
    .enum(['text', 'without-match', 'binary'])
    .optional()
    .default('without-match')
    .describe(
      'Binary handling: "text" (search as text), "without-match" (default), "binary" (detect).'
    ),

  // OUTPUT FORMAT & METADATA
  includeStats: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include search stats (matches, files, bytes, time).'),
  jsonOutput: z.boolean().optional().describe('Output NDJSON (structured).'),
  vimgrepFormat: z
    .boolean()
    .optional()
    .describe('vim-compatible format (file:line:col:text).'),
  includeDistribution: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include match distribution across files.'),
  threads: z
    .number()
    .int()
    .min(1)
    .max(32)
    .optional()
    .describe('Number of threads (default: auto).'),
  mmap: z
    .boolean()
    .optional()
    .describe('Use memory mapping (faster on large files).'),
  noUnicode: z
    .boolean()
    .optional()
    .describe(
      'Disable Unicode mode. Faster on ASCII codebases; \\w matches ASCII only.'
    ),
  encoding: z
    .string()
    .optional()
    .describe(
      'Text encoding: "auto" (default), "none" (raw bytes), or specific (e.g., "utf-8", "utf-16le"). See: https://encoding.spec.whatwg.org/#names'
    ),
  sort: z
    .enum(['path', 'modified', 'accessed', 'created'])
    .optional()
    .default('path')
    .describe(
      'Sort results: "path" (default), "modified", "accessed", "created". Sorting can be slower; use only when needed.'
    ),
  sortReverse: z.boolean().optional().describe('Reverse sort order.'),
  noMessages: z
    .boolean()
    .optional()
    .describe(
      'Suppress error messages (permission denied, file too large, etc.).'
    ),
  lineRegexp: z
    .boolean()
    .optional()
    .describe(
      'Match entire lines only (equivalent to ^...$). "foo" matches only "foo", not "foobar".'
    ),
  passthru: z
    .boolean()
    .optional()
    .describe(
      'Print all lines with highlights (can be huge). Conflicts with filesOnly.'
    ),
  debug: z
    .boolean()
    .optional()
    .describe(
      'Show debug info (ignores, config, strategy, performance). Output to stderr.'
    ),

  showFileLastModified: z
    .boolean()
    .default(false)
    .describe('Show file last modified timestamps in results (default false).'),
});

/**
 * Bulk ripgrep search schema (1–5 queries per call)
 */
export const BulkRipgrepQuerySchema = createBulkQuerySchemaLocal(
  TOOL_NAMES.LOCAL_RIPGREP || 'localSearchCode',
  RipgrepQuerySchema
);

export type RipgrepQuery = z.infer<typeof RipgrepQuerySchema>;
export type BulkRipgrepQuery = z.infer<typeof BulkRipgrepQuerySchema>;

/**
 * Apply workflow mode presets to query
 * Mode settings are applied first, then overridden by explicit parameters
 */
export function applyWorkflowMode(query: RipgrepQuery): RipgrepQuery {
  if (!query.mode) {
    return query;
  }

  const modeDefaults: Partial<RipgrepQuery> = {};

  switch (query.mode) {
    case 'discovery':
      // Workflow A: Fast file discovery (25x more efficient)
      modeDefaults.filesOnly = true;
      modeDefaults.smartCase = true;
      break;

    case 'paginated':
      // Workflow B: Paginated content with sensible limits
      modeDefaults.filesPerPage = 10;
      modeDefaults.matchesPerPage = 10;
      modeDefaults.smartCase = true;
      break;

    case 'detailed':
      // Full matches with context
      modeDefaults.contextLines = 3;
      modeDefaults.filesPerPage = 10;
      modeDefaults.matchesPerPage = 20;
      modeDefaults.smartCase = true;
      break;
  }

  // Apply mode defaults, but allow explicit parameters to override
  return {
    ...modeDefaults,
    ...query,
  };
}

/**
 * Validation helper: Check for common misconfigurations
 */
export function validateRipgrepQuery(query: RipgrepQuery): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Mutual exclusivity checks
  if (query.fixedString && query.perlRegex) {
    errors.push(
      'fixedString and perlRegex are mutually exclusive. Choose one.'
    );
  }

  if (query.filesOnly && query.count) {
    warnings.push(
      'filesOnly and count are mutually exclusive. Using filesOnly.'
    );
  }

  if (query.filesOnly && query.filesWithoutMatch) {
    errors.push(
      'filesOnly and filesWithoutMatch are mutually exclusive. Choose one.'
    );
  }

  if (query.passthru && query.filesOnly) {
    errors.push('passthru and filesOnly are mutually exclusive.');
  }

  if (query.passthru) {
    warnings.push(
      'passthru prints ALL lines from matched files. ' +
        'This can produce very large output. Consider using context lines instead.'
    );
  }

  if (query.lineRegexp && query.wholeWord) {
    warnings.push(
      'lineRegexp and wholeWord both specified. lineRegexp takes precedence.'
    );
  }

  // Case sensitivity
  const caseModes = [
    query.caseInsensitive,
    query.caseSensitive,
    query.smartCase,
  ].filter(Boolean);
  if (caseModes.length > 1) {
    warnings.push(
      'Multiple case sensitivity modes specified. Priority: caseSensitive > caseInsensitive > smartCase'
    );
  }

  const hasContext =
    (query.contextLines && query.contextLines > 2) ||
    (query.beforeContext && query.beforeContext > 2) ||
    (query.afterContext && query.afterContext > 2);

  if (hasContext) {
    const contentLength = query.matchContentLength || 200;
    warnings.push(
      `Context lines enabled (${query.contextLines || query.beforeContext || query.afterContext} lines). ` +
        `Match values will include context and be truncated to ${contentLength} chars. Use matchesPerPage for pagination.`
    );
  }

  if (query.multiline) {
    warnings.push(
      'Multiline mode is memory-intensive and slower. ' +
        'Entire files are loaded into memory. Only use when pattern genuinely spans multiple lines.'
    );
  }

  if (query.perlRegex && !query.noUnicode && query.multiline) {
    warnings.push(
      'PERFORMANCE TIP: For fastest PCRE2 multiline searches on ASCII codebases, ' +
        'consider using noUnicode=true (2-3x faster).'
    );
  }

  if (
    !query.filesOnly &&
    !query.count &&
    !query.maxMatchesPerFile &&
    !query.matchesPerPage
  ) {
    warnings.push(
      'No output limiting specified. Consider setting maxMatchesPerFile (default: 3) to control output size.'
    );
  }

  if (query.include && query.include.length > 1) {
    const allSimpleGlobs = query.include.every(g =>
      g.match(/^\*\.[a-zA-Z0-9]+$/)
    );
    const firstInclude = query.include[0];

    if (allSimpleGlobs && firstInclude && !firstInclude.includes('{')) {
      const exts = query.include.map(g => g.replace('*.', '')).join(',');
      warnings.push(
        `TIP: Consolidate globs for better performance: include=["*.{${exts}}"] instead of separate globs.`
      );
    }
  }

  if (query.include && !query.type) {
    const simpleType = query.include[0]?.match(/^\*\.([a-z]+)$/)?.[1];
    const knownTypes = ['ts', 'js', 'py', 'rust', 'go', 'java', 'cpp', 'c'];

    if (simpleType && knownTypes.includes(simpleType)) {
      warnings.push(
        `TIP: Use type="${simpleType}" instead of include glob for cleaner syntax.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}
