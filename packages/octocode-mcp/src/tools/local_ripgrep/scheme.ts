/**
 * Zod schema for localSearchCode tool
 * Optimized ripgrep implementation with performance enhancements
 */

import { z } from 'zod';
import {
  BaseQuerySchemaLocal,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { LOCAL_RIPGREP, TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata.js';

/**
 * Tool description for localSearchCode
 */
export const LOCAL_RIPGREP_DESCRIPTION = DESCRIPTIONS[TOOL_NAMES.LOCAL_RIPGREP];

/**
 * Ripgrep search content query schema
 * Optimized based on performance research
 */
export const RipgrepQuerySchema = BaseQuerySchemaLocal.extend({
  // REQUIRED FIELDS
  pattern: z.string().min(1).describe(LOCAL_RIPGREP.search.pattern),
  path: z.string().describe(LOCAL_RIPGREP.search.path),

  // WORKFLOW MODE (recommended presets)
  mode: z
    .enum(['discovery', 'paginated', 'detailed'])
    .optional()
    .describe(LOCAL_RIPGREP.search.mode),

  // PATTERN MODES (mutually exclusive - validated at runtime)
  fixedString: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.options.fixedString),
  perlRegex: z.boolean().optional().describe(LOCAL_RIPGREP.options.perlRegex),

  // CASE SENSITIVITY (smart case recommended)
  smartCase: z
    .boolean()
    .optional()
    .default(true)
    .describe(LOCAL_RIPGREP.options.smartCase),
  caseInsensitive: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.options.caseInsensitive),
  caseSensitive: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.options.caseSensitive),

  // MATCH BEHAVIOR
  wholeWord: z.boolean().optional().describe(LOCAL_RIPGREP.options.wholeWord),
  invertMatch: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.options.invertMatch),

  // FILE FILTERING (optimized strategies)
  type: z.string().optional().describe(LOCAL_RIPGREP.filters.type),
  include: z
    .array(z.string())
    .optional()
    .describe(LOCAL_RIPGREP.filters.include),
  exclude: z
    .array(z.string())
    .optional()
    .describe(LOCAL_RIPGREP.filters.exclude),
  excludeDir: z
    .array(z.string())
    .optional()
    .describe(LOCAL_RIPGREP.filters.excludeDir),

  // IGNORE CONTROL (gitignore behavior)
  noIgnore: z.boolean().optional().describe(LOCAL_RIPGREP.filters.noIgnore),
  hidden: z.boolean().optional().describe(LOCAL_RIPGREP.filters.hidden),
  followSymlinks: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.filters.followSymlinks),

  // OUTPUT CONTROL (critical for performance)
  filesOnly: z.boolean().optional().describe(LOCAL_RIPGREP.output.filesOnly),
  filesWithoutMatch: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.output.filesWithoutMatch),
  count: z.boolean().optional().describe(LOCAL_RIPGREP.output.count),
  countMatches: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.output.countMatches),

  // CONTEXT & LINE CONTROL (semantic: defines WHAT to extract)
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe(LOCAL_RIPGREP.context.contextLines),
  beforeContext: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe(LOCAL_RIPGREP.context.beforeContext),
  afterContext: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe(LOCAL_RIPGREP.context.afterContext),
  matchContentLength: z
    .number()
    .int()
    .min(1)
    .max(800)
    .optional()
    .default(200)
    .describe(LOCAL_RIPGREP.context.matchContentLength),
  lineNumbers: z
    .boolean()
    .optional()
    .default(true)
    .describe(LOCAL_RIPGREP.context.lineNumbers),
  column: z.boolean().optional().describe(LOCAL_RIPGREP.context.column),

  // MATCH LIMITING (prevents output explosion)
  maxMatchesPerFile: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(LOCAL_RIPGREP.pagination.maxMatchesPerFile),
  maxFiles: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe(LOCAL_RIPGREP.pagination.maxFiles),

  // TWO-LEVEL PAGINATION (file-level + per-file matches)
  filesPerPage: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe(LOCAL_RIPGREP.pagination.filesPerPage),
  filePageNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(LOCAL_RIPGREP.pagination.filePageNumber),
  matchesPerPage: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe(LOCAL_RIPGREP.pagination.matchesPerPage),

  // ADVANCED FEATURES (use with caution)
  multiline: z.boolean().optional().describe(LOCAL_RIPGREP.options.multiline),
  multilineDotall: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.options.multilineDotall),
  binaryFiles: z
    .enum(['text', 'without-match', 'binary'])
    .optional()
    .default('without-match')
    .describe(LOCAL_RIPGREP.filters.binaryFiles),

  // OUTPUT FORMAT & METADATA
  includeStats: z
    .boolean()
    .optional()
    .default(true)
    .describe(LOCAL_RIPGREP.output.includeStats),
  jsonOutput: z.boolean().optional().describe(LOCAL_RIPGREP.output.jsonOutput),
  vimgrepFormat: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.output.vimgrepFormat),
  includeDistribution: z
    .boolean()
    .optional()
    .default(true)
    .describe(LOCAL_RIPGREP.output.includeDistribution),

  // ADVANCED OPTIONS
  threads: z
    .number()
    .int()
    .min(1)
    .max(32)
    .optional()
    .describe(LOCAL_RIPGREP.advanced.threads),
  mmap: z.boolean().optional().describe(LOCAL_RIPGREP.advanced.mmap),
  noUnicode: z.boolean().optional().describe(LOCAL_RIPGREP.advanced.noUnicode),
  encoding: z.string().optional().describe(LOCAL_RIPGREP.advanced.encoding),
  sort: z
    .enum(['path', 'modified', 'accessed', 'created'])
    .optional()
    .default('path')
    .describe(LOCAL_RIPGREP.advanced.sort),
  sortReverse: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.advanced.sortReverse),
  noMessages: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.advanced.noMessages),
  lineRegexp: z
    .boolean()
    .optional()
    .describe(LOCAL_RIPGREP.advanced.lineRegexp),
  passthru: z.boolean().optional().describe(LOCAL_RIPGREP.advanced.passthru),
  debug: z.boolean().optional().describe(LOCAL_RIPGREP.advanced.debug),

  showFileLastModified: z
    .boolean()
    .default(false)
    .describe(LOCAL_RIPGREP.advanced.showFileLastModified),
});

/**
 * Bulk ripgrep search schema (1–5 queries per call)
 */
export const BulkRipgrepQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_RIPGREP,
  RipgrepQuerySchema,
  { maxQueries: 5 }
);

export type RipgrepQuery = z.infer<typeof RipgrepQuerySchema>;

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

  // Warn about invertMatch semantics
  if (query.invertMatch && !query.filesWithoutMatch) {
    warnings.push(
      'invertMatch inverts at LINE level (shows non-matching lines). ' +
        'Files in results may still contain the pattern on other lines. ' +
        'For FILE-level inversion (files without ANY matches), use filesWithoutMatch=true instead.'
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
