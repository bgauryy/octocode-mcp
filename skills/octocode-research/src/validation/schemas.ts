import { z } from 'zod';
import path from 'path';

// =============================================================================
// Custom Preprocessors
// =============================================================================

/**
 * Preprocess string to number (for query params)
 */
const toNumber = (val: unknown) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && /^\d+$/.test(val)) return parseInt(val, 10);
  return val;
};

/**
 * Preprocess string to boolean
 */
const toBoolean = (val: unknown) => {
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val;
};

/**
 * Preprocess comma-separated string to array
 */
const toArray = (val: unknown) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(',').map((s) => s.trim());
  return val;
};

// =============================================================================
// Reusable Schema Parts
// =============================================================================

const numericString = z.preprocess(toNumber, z.number().optional());
const requiredNumber = z.preprocess(toNumber, z.number());
const booleanString = z.preprocess(toBoolean, z.boolean().optional());
const stringArray = z.preprocess(toArray, z.array(z.string()));

/**
 * Safe path that blocks traversal attacks
 */
const safePath = z.string().refine(
  (p) => {
    const normalized = path.normalize(p);
    if (normalized.includes('..')) return false;
    if (p.includes('\0')) return false;
    return true;
  },
  { message: 'Path contains invalid traversal patterns' }
);

// =============================================================================
// Base Research Context
// =============================================================================

const researchDefaults = {
  mainResearchGoal: 'HTTP API request',
  researchGoal: 'Execute tool via HTTP',
  reasoning: 'HTTP API call',
};

// =============================================================================
// Local Route Schemas
// =============================================================================

export const localSearchSchema = z
  .object({
    // Required
    pattern: z.string().min(1, 'Pattern is required'),
    path: safePath,

    // Workflow mode preset
    mode: z.enum(['discovery', 'paginated', 'detailed']).optional(),

    // Pattern interpretation
    fixedString: booleanString, // treat pattern as literal string
    perlRegex: booleanString, // use PCRE2 regex engine

    // Case sensitivity (smartCase is default in MCP)
    smartCase: booleanString,
    caseInsensitive: booleanString,
    caseSensitive: booleanString,

    // Match behavior
    wholeWord: booleanString,
    invertMatch: booleanString,
    multiline: booleanString,
    multilineDotall: booleanString,
    lineRegexp: booleanString,

    // File filtering
    type: z.string().optional(), // file type code like 'ts', 'py'
    include: stringArray.optional(),
    exclude: stringArray.optional(),
    excludeDir: stringArray.optional(),
    binaryFiles: z.enum(['text', 'without-match', 'binary']).optional(),

    // Ignore control
    noIgnore: booleanString,
    hidden: booleanString,
    followSymlinks: booleanString,

    // Output control
    filesOnly: booleanString,
    filesWithoutMatch: booleanString,
    count: booleanString,
    countMatches: booleanString,
    lineNumbers: booleanString,
    column: booleanString,

    // Context control
    contextLines: numericString,
    beforeContext: numericString,
    afterContext: numericString,
    context: numericString, // deprecated, use contextLines
    matchContentLength: numericString,

    // Match limiting
    maxMatchesPerFile: numericString,
    maxFiles: numericString,
    maxResults: numericString, // deprecated, use limit

    // Pagination
    limit: numericString,
    filesPerPage: numericString,
    filePageNumber: numericString,
    matchesPerPage: numericString,

    // Stats & output format
    includeStats: booleanString,
    includeDistribution: booleanString,
    jsonOutput: booleanString,
    vimgrepFormat: booleanString,

    // Advanced options
    threads: numericString,
    mmap: booleanString,
    noUnicode: booleanString,
    encoding: z.string().optional(),
    sort: z.enum(['path', 'modified', 'accessed', 'created']).optional(),
    sortReverse: booleanString,
    noMessages: booleanString,
    passthru: booleanString,
    debug: booleanString,
    showFileLastModified: booleanString,

    // Research context
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => {
    const result = {
      ...researchDefaults,
      ...data,
    };
    // Map deprecated params for backwards compat
    if (result.contextLines === undefined && data.context !== undefined) {
      result.contextLines = data.context;
    }
    if (result.limit === undefined && data.maxResults !== undefined) {
      result.limit = data.maxResults;
    }
    // Convert single string include/exclude to arrays if needed
    if (data.include && !Array.isArray(data.include)) {
      result.include = [data.include as string];
    }
    if (data.exclude && !Array.isArray(data.exclude)) {
      result.exclude = [data.exclude as string];
    }
    return result;
  });

export const localContentSchema = z
  .object({
    path: safePath,

    // Line-based pagination
    startLine: numericString,
    endLine: numericString,
    fullContent: booleanString,

    // Pattern matching within file
    matchString: z.string().optional(),
    matchStringContextLines: numericString,
    matchStringIsRegex: booleanString,
    matchStringCaseSensitive: booleanString,

    // Character-based pagination
    charOffset: numericString,
    charLength: numericString,

    // Format detection

    // Research context
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

/**
 * Transform human-readable file type to MCP's Unix-style type codes
 * MCP supports: f (file), d (directory), l (symlink), b (block device),
 * c (character device), p (pipe/fifo), s (socket)
 */
const fileTypeTransform = (val: string | undefined) => {
  if (!val) return undefined;
  const typeMap: Record<string, string | undefined> = {
    // Human-readable aliases
    file: 'f',
    directory: 'd',
    symlink: 'l',
    block: 'b',
    character: 'c',
    pipe: 'p',
    socket: 's',
    all: undefined,
    // MCP's native codes (pass through)
    f: 'f',
    d: 'd',
    l: 'l',
    b: 'b',
    c: 'c',
    p: 'p',
    s: 's',
  };
  return typeMap[val] ?? val;
};

export const localFindSchema = z
  .object({
    path: safePath,
    // MCP uses 'name' for filename filter, but we also accept 'pattern' for compatibility
    pattern: z.string().optional(),
    name: z.string().optional(),
    names: stringArray.optional(), // array of filenames to search for
    iname: z.string().optional(), // case-insensitive filename filter
    pathPattern: z.string().optional(),
    regex: z.string().optional(),
    regexType: z.enum(['posix-egrep', 'posix-extended', 'posix-basic']).optional(),
    // Type filter - accepts both human-readable and MCP codes
    // MCP supports: f, d, l, b, c, p, s (Unix file type codes)
    type: z
      .enum([
        // Human-readable aliases
        'file', 'directory', 'symlink', 'block', 'character', 'pipe', 'socket', 'all',
        // MCP native codes
        'f', 'd', 'l', 'b', 'c', 'p', 's',
      ])
      .optional()
      .transform(fileTypeTransform),
    // File property filters
    empty: booleanString,
    executable: booleanString,
    readable: booleanString,
    writable: booleanString,
    permissions: z.string().optional(),
    // Depth control
    maxDepth: numericString,
    minDepth: numericString,
    // Time filters
    modifiedWithin: z.string().optional(), // e.g., "1d", "2h"
    modifiedBefore: z.string().optional(),
    accessedWithin: z.string().optional(),
    // Size filters (string format: "100k", "1M")
    sizeGreater: z.string().optional(),
    sizeLess: z.string().optional(),
    // Directory exclusion
    excludeDir: stringArray.optional(),
    // Pagination
    limit: numericString,
    maxResults: numericString, // deprecated, use limit
    filesPerPage: numericString,
    filePageNumber: numericString,
    charOffset: numericString,
    charLength: numericString,
    // Output control
    details: booleanString,
    showFileLastModified: booleanString,
    // Research context
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => {
    // Map backwards compat params only if MCP param not provided
    const result = {
      ...researchDefaults,
      ...data,
    };
    // Map pattern to name if name not provided (backwards compat)
    if (result.name === undefined && data.pattern !== undefined) {
      result.name = data.pattern;
    }
    // Map maxResults to limit if limit not provided (backwards compat)
    if (result.limit === undefined && data.maxResults !== undefined) {
      result.limit = data.maxResults;
    }
    return result;
  });

export const localStructureSchema = z
  .object({
    path: safePath,

    // Filtering
    pattern: z.string().optional(), // glob pattern
    directoriesOnly: booleanString,
    filesOnly: booleanString,
    extension: z.string().optional(),
    extensions: z.string().optional(), // comma-separated

    // Visibility control
    hidden: booleanString, // MCP param name
    showHidden: booleanString, // backwards compat

    // Depth control
    depth: numericString,
    recursive: booleanString,

    // Output control
    details: booleanString,
    humanReadable: booleanString,
    summary: booleanString,
    showFileLastModified: booleanString,

    // Sorting
    sortBy: z.enum(['name', 'size', 'time', 'extension']).optional(),
    reverse: booleanString,

    // Pagination
    limit: numericString,
    entriesPerPage: numericString,
    entryPageNumber: numericString,
    charOffset: numericString,
    charLength: numericString,

    // Research context
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => {
    const result = {
      ...researchDefaults,
      ...data,
    };
    // Map backwards compat params
    if (result.hidden === undefined && data.showHidden !== undefined) {
      result.hidden = data.showHidden;
    }
    return result;
  });

// =============================================================================
// LSP Route Schemas
// =============================================================================

export const lspDefinitionSchema = z
  .object({
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 1, 'Line hint must be at least 1'),
    orderHint: numericString.default(0),
    contextLines: numericString.default(5),
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const lspReferencesSchema = z
  .object({
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 1, 'Line hint must be at least 1'),
    orderHint: numericString.default(0),
    includeDeclaration: booleanString.default(true),
    contextLines: numericString.default(2),
    referencesPerPage: numericString.default(20),
    page: numericString.default(1),
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const lspCallsSchema = z
  .object({
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 1, 'Line hint must be at least 1'),
    orderHint: numericString.default(0),
    direction: z.enum(['incoming', 'outgoing'], {
      errorMap: () => ({ message: "Direction must be 'incoming' or 'outgoing'" }),
    }),
    depth: numericString.default(1),
    contextLines: numericString.default(2),
    callsPerPage: numericString.default(15),
    page: numericString.default(1),
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

// =============================================================================
// GitHub Route Schemas
// =============================================================================

export const githubSearchSchema = z
  .object({
    keywordsToSearch: stringArray,
    owner: z.string().optional(),
    repo: z.string().optional(),
    path: z.string().optional(),
    extension: z.string().optional(),
    filename: z.string().optional(),
    match: z.enum(['file', 'path']).optional(),
    limit: numericString,
    page: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const githubContentSchema = z
  .object({
    owner: z.string().min(1, 'Owner is required'),
    repo: z.string().min(1, 'Repo is required'),
    path: z.string().min(1, 'Path is required'),
    branch: z.string().optional(),
    fullContent: booleanString,
    startLine: numericString,
    endLine: numericString,
    matchString: z.string().optional(),
    matchStringContextLines: numericString,
    charOffset: numericString,
    charLength: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const githubReposSchema = z
  .object({
    // Search terms (at least one of keywordsToSearch or topicsToSearch required)
    keywordsToSearch: stringArray.optional(),
    topicsToSearch: stringArray.optional(),
    // Filters
    owner: z.string().optional(),
    stars: z.string().optional(), // e.g., ">1000", "100..500"
    size: z.string().optional(), // e.g., ">1000" (KB)
    created: z.string().optional(), // e.g., ">2020-01-01"
    updated: z.string().optional(), // e.g., ">2024-01-01"
    match: z.preprocess(toArray, z.array(z.enum(['name', 'description', 'readme'])).optional()),
    // Sorting & pagination
    sort: z.enum(['stars', 'forks', 'updated', 'best-match']).optional(),
    limit: numericString,
    page: numericString,
    // Research context
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.keywordsToSearch && data.keywordsToSearch.length > 0) ||
      (data.topicsToSearch && data.topicsToSearch.length > 0),
    {
      message: "At least one of 'keywordsToSearch' or 'topicsToSearch' is required",
      path: ['keywordsToSearch'],
    }
  )
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const githubStructureSchema = z
  .object({
    owner: z.string().min(1, 'Owner is required'),
    repo: z.string().min(1, 'Repo is required'),
    branch: z.string().min(1, 'Branch is required'),
    path: z.string().optional(),
    depth: numericString,
    entriesPerPage: numericString,
    entryPageNumber: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const githubPRsSchema = z
  .object({
    // Search & scope
    query: z.string().optional(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    prNumber: numericString,
    // Match scope
    match: z.preprocess(toArray, z.array(z.enum(['title', 'body', 'comments'])).optional()),
    // User filters
    author: z.string().optional(),
    assignee: z.string().optional(),
    commenter: z.string().optional(),
    involves: z.string().optional(),
    mentions: z.string().optional(),
    'review-requested': z.string().optional(),
    'reviewed-by': z.string().optional(),
    // Labels & metadata filters
    label: z.preprocess(toArray, z.union([z.string(), z.array(z.string())]).optional()),
    'no-label': booleanString,
    'no-milestone': booleanString,
    'no-project': booleanString,
    'no-assignee': booleanString,
    // Branch filters
    base: z.string().optional(),
    head: z.string().optional(),
    // State & date filters
    state: z.enum(['open', 'closed']).optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
    closed: z.string().optional(),
    'merged-at': z.string().optional(),
    // Numeric filters (support range syntax like ">10", "5..20")
    comments: z.union([numericString, z.string()]).optional(),
    reactions: z.union([numericString, z.string()]).optional(),
    interactions: z.union([numericString, z.string()]).optional(),
    // Boolean filters
    merged: booleanString,
    draft: booleanString,
    // Output shaping
    withComments: booleanString,
    withCommits: booleanString,
    type: z.enum(['metadata', 'fullContent', 'partialContent']).optional(),
    // Sorting & pagination
    sort: z.enum(['created', 'updated', 'best-match']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    limit: numericString,
    page: numericString,
    // Research context
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

// =============================================================================
// Package Route Schemas
// =============================================================================

export const packageSearchSchema = z
  .object({
    name: z.string().min(1, 'Package name is required'),
    ecosystem: z.enum(['npm', 'python']).optional().default('npm'),
    searchLimit: numericString,
    npmFetchMetadata: booleanString,
    pythonFetchMetadata: booleanString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

// =============================================================================
// Type Exports (output types after transform)
// =============================================================================

export type LocalSearchQuery = z.output<typeof localSearchSchema>;
export type LocalContentQuery = z.output<typeof localContentSchema>;
export type LocalFindQuery = z.output<typeof localFindSchema>;
export type LocalStructureQuery = z.output<typeof localStructureSchema>;

export type LspDefinitionQuery = z.output<typeof lspDefinitionSchema>;
export type LspReferencesQuery = z.output<typeof lspReferencesSchema>;
export type LspCallsQuery = z.output<typeof lspCallsSchema>;

export type GithubSearchQuery = z.output<typeof githubSearchSchema>;
export type GithubContentQuery = z.output<typeof githubContentSchema>;
export type GithubReposQuery = z.output<typeof githubReposSchema>;
export type GithubStructureQuery = z.output<typeof githubStructureSchema>;
export type GithubPRsQuery = z.output<typeof githubPRsSchema>;

export type PackageSearchQuery = z.output<typeof packageSearchSchema>;
