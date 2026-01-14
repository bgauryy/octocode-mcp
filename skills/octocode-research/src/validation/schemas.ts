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
  if (typeof val === 'string' && /^-?\d+$/.test(val)) return parseInt(val, 10);
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
const optionalStringArray = z.preprocess(toArray, z.array(z.string()).optional());

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

/**
 * localSearchCode - Ripgrep-based code search
 * Matches: packages/octocode-mcp/src/tools/local_ripgrep/scheme.ts
 */
export const localSearchSchema = z
  .object({
    // Required
    pattern: z.string().min(1, 'Pattern is required'),
    path: safePath,
    // Mode
    mode: z.enum(['discovery', 'paginated', 'detailed']).optional(),
    // Pattern options
    fixedString: booleanString,
    perlRegex: booleanString,
    smartCase: booleanString,
    caseInsensitive: booleanString,
    caseSensitive: booleanString,
    wholeWord: booleanString,
    invertMatch: booleanString,
    multiline: booleanString,
    multilineDotall: booleanString,
    lineRegexp: booleanString,
    // File filters
    type: z.string().optional(),
    include: optionalStringArray,
    exclude: optionalStringArray,
    excludeDir: optionalStringArray,
    noIgnore: booleanString,
    hidden: booleanString,
    followSymlinks: booleanString,
    binaryFiles: z.enum(['text', 'without-match', 'binary']).optional(),
    // Output options
    filesOnly: booleanString,
    filesWithoutMatch: booleanString,
    count: booleanString,
    countMatches: booleanString,
    includeStats: booleanString,
    includeDistribution: booleanString,
    jsonOutput: booleanString,
    vimgrepFormat: booleanString,
    // Context
    contextLines: numericString,
    beforeContext: numericString,
    afterContext: numericString,
    matchContentLength: numericString,
    lineNumbers: booleanString,
    column: booleanString,
    // Pagination
    maxMatchesPerFile: numericString,
    maxFiles: numericString,
    filesPerPage: numericString,
    filePageNumber: numericString,
    matchesPerPage: numericString,
    // Advanced
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
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

/**
 * localGetFileContent - Read file content
 * Matches: packages/octocode-mcp/src/tools/local_fetch_content/scheme.ts
 */
export const localContentSchema = z
  .object({
    // Required
    path: safePath,
    // Content extraction options
    fullContent: booleanString,
    startLine: numericString,
    endLine: numericString,
    matchString: z.string().optional(),
    matchStringContextLines: numericString,
    matchStringIsRegex: booleanString,
    matchStringCaseSensitive: booleanString,
    // Pagination
    charOffset: numericString,
    charLength: numericString,
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
 * localFindFiles - Find files by metadata
 * Matches: packages/octocode-mcp/src/tools/local_find_files/scheme.ts
 */
export const localFindSchema = z
  .object({
    // Required
    path: safePath,
    // Name filters
    name: z.string().optional(),
    iname: z.string().optional(),
    names: optionalStringArray,
    pathPattern: z.string().optional(),
    regex: z.string().optional(),
    regexType: z.enum(['posix-egrep', 'posix-extended', 'posix-basic']).optional(),
    // Type filters
    type: z.enum(['f', 'd', 'l', 'b', 'c', 'p', 's']).optional(),
    empty: booleanString,
    executable: booleanString,
    readable: booleanString,
    writable: booleanString,
    // Depth
    maxDepth: numericString,
    minDepth: numericString,
    // Time filters
    modifiedWithin: z.string().optional(),
    modifiedBefore: z.string().optional(),
    accessedWithin: z.string().optional(),
    // Size filters
    sizeGreater: z.string().optional(),
    sizeLess: z.string().optional(),
    // Other filters
    permissions: z.string().optional(),
    excludeDir: optionalStringArray,
    // Output options
    details: booleanString,
    showFileLastModified: booleanString,
    // Pagination
    limit: numericString,
    filesPerPage: numericString,
    filePageNumber: numericString,
    charOffset: numericString,
    charLength: numericString,
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
 * localViewStructure - View directory structure
 * Matches: packages/octocode-mcp/src/tools/local_view_structure/scheme.ts
 */
export const localStructureSchema = z
  .object({
    // Required
    path: safePath,
    // Display options
    details: booleanString,
    hidden: booleanString,
    humanReadable: booleanString,
    summary: booleanString,
    showFileLastModified: booleanString,
    // Sorting
    sortBy: z.enum(['name', 'size', 'time', 'extension']).optional(),
    reverse: booleanString,
    // Filtering
    pattern: z.string().optional(),
    directoriesOnly: booleanString,
    filesOnly: booleanString,
    extension: z.string().optional(),
    extensions: optionalStringArray,
    // Depth
    depth: numericString,
    recursive: booleanString,
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
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

// =============================================================================
// LSP Route Schemas
// =============================================================================

/**
 * lspGotoDefinition - Jump to symbol definition
 * Matches: packages/octocode-mcp/src/tools/lsp_goto_definition/scheme.ts
 */
export const lspDefinitionSchema = z
  .object({
    // Required
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 1, 'Line hint must be >= 1'),
    // Options
    orderHint: numericString,
    contextLines: numericString,
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
 * lspFindReferences - Find all usages
 * Matches: packages/octocode-mcp/src/tools/lsp_find_references/scheme.ts
 */
export const lspReferencesSchema = z
  .object({
    // Required
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 1, 'Line hint must be >= 1'),
    // Options
    orderHint: numericString,
    includeDeclaration: booleanString,
    contextLines: numericString,
    // Pagination
    referencesPerPage: numericString,
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

/**
 * lspCallHierarchy - Trace call relationships
 * Matches: packages/octocode-mcp/src/tools/lsp_call_hierarchy/scheme.ts
 */
export const lspCallsSchema = z
  .object({
    // Required
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 1, 'Line hint must be >= 1'),
    direction: z.enum(['incoming', 'outgoing'], {
      errorMap: () => ({ message: "Direction must be 'incoming' or 'outgoing'" }),
    }),
    // Options
    orderHint: numericString,
    depth: numericString,
    contextLines: numericString,
    // Pagination
    callsPerPage: numericString,
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
// GitHub Route Schemas
// =============================================================================

/**
 * githubSearchCode - Search code on GitHub
 * Matches: packages/octocode-mcp/src/tools/github_search_code/scheme.ts
 */
export const githubSearchSchema = z
  .object({
    // Required
    keywordsToSearch: stringArray,
    // Scope
    owner: z.string().optional(),
    repo: z.string().optional(),
    // Filters
    path: z.string().optional(),
    extension: z.string().optional(),
    filename: z.string().optional(),
    match: z.enum(['file', 'path']).optional(),
    // Pagination
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

/**
 * githubGetFileContent - Read file from GitHub
 * Matches: packages/octocode-mcp/src/tools/github_fetch_content/scheme.ts
 */
export const githubContentSchema = z
  .object({
    // Required
    owner: z.string().min(1, 'Owner is required'),
    repo: z.string().min(1, 'Repo is required'),
    path: z.string().min(1, 'Path is required'),
    // Options
    branch: z.string().optional(),
    fullContent: booleanString,
    // Line range extraction
    startLine: numericString,
    endLine: numericString,
    // Match string extraction
    matchString: z.string().optional(),
    matchStringContextLines: numericString,
    // Pagination
    charOffset: numericString,
    charLength: numericString,
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
 * githubSearchRepositories - Search repositories on GitHub
 * Matches: packages/octocode-mcp/src/tools/github_search_repos/scheme.ts
 */
export const githubReposSchema = z
  .object({
    // Search terms (at least one required)
    keywordsToSearch: optionalStringArray,
    topicsToSearch: optionalStringArray,
    // Scope
    owner: z.string().optional(),
    // Filters
    stars: z.string().optional(),
    size: z.string().optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
    match: z.preprocess(toArray, z.array(z.enum(['name', 'description', 'readme'])).optional()),
    // Sorting
    sort: z.enum(['forks', 'stars', 'updated', 'best-match']).optional(),
    // Pagination
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

/**
 * githubViewRepoStructure - View repository structure
 * Matches: packages/octocode-mcp/src/tools/github_view_repo_structure/scheme.ts
 */
export const githubStructureSchema = z
  .object({
    // Required
    owner: z.string().min(1, 'Owner is required'),
    repo: z.string().min(1, 'Repo is required'),
    branch: z.string().min(1, 'Branch is required'),
    // Options
    path: z.string().optional(),
    depth: numericString,
    // Pagination
    entriesPerPage: numericString,
    entryPageNumber: numericString,
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
 * githubSearchPullRequests - Search PRs on GitHub
 * Matches: packages/octocode-mcp/src/tools/github_search_pull_requests/scheme.ts
 */
export const githubPRsSchema = z
  .object({
    // Search
    query: z.string().optional(),
    // Scope
    owner: z.string().optional(),
    repo: z.string().optional(),
    prNumber: numericString,
    // State filters
    state: z.enum(['open', 'closed']).optional(),
    merged: booleanString,
    draft: booleanString,
    // People filters
    author: z.string().optional(),
    assignee: z.string().optional(),
    commenter: z.string().optional(),
    involves: z.string().optional(),
    mentions: z.string().optional(),
    'review-requested': z.string().optional(),
    'reviewed-by': z.string().optional(),
    // Label/milestone filters
    label: z.union([z.string(), stringArray]).optional(),
    'no-label': booleanString,
    'no-milestone': booleanString,
    'no-project': booleanString,
    'no-assignee': booleanString,
    // Branch filters
    head: z.string().optional(),
    base: z.string().optional(),
    // Date filters
    created: z.string().optional(),
    updated: z.string().optional(),
    closed: z.string().optional(),
    'merged-at': z.string().optional(),
    // Engagement filters
    comments: z.union([numericString, z.string()]).optional(),
    reactions: z.union([numericString, z.string()]).optional(),
    interactions: z.union([numericString, z.string()]).optional(),
    // Match scope
    match: z.preprocess(toArray, z.array(z.enum(['title', 'body', 'comments'])).optional()),
    // Sorting
    sort: z.enum(['created', 'updated', 'best-match']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    // Pagination
    limit: numericString,
    page: numericString,
    // Output shaping
    type: z.enum(['metadata', 'fullContent', 'partialContent']).optional(),
    withComments: booleanString,
    withCommits: booleanString,
    partialContentMetadata: z.string().optional(), // JSON string of array
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

/**
 * packageSearch - Search npm/PyPI packages
 * Matches: packages/octocode-mcp/src/tools/package_search/scheme.ts
 */
export const packageSearchSchema = z
  .object({
    // Required
    name: z.string().min(1, 'Package name is required'),
    ecosystem: z.enum(['npm', 'python']).optional().default('npm'),
    // Options
    searchLimit: numericString,
    npmFetchMetadata: booleanString,
    pythonFetchMetadata: booleanString,
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
