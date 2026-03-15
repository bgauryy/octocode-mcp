import { z } from 'zod/v4';

const QueryMetaSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .describe('Stable query identifier matching the input query id'),
  })
  .strict();

const HintsSchema = z
  .array(z.string())
  .optional()
  .describe(
    'Contextual hints and suggestions for next steps or better queries'
  );

const GitHubApiErrorSchema = z
  .object({
    error: z.string().describe('GitHub API error message'),
    status: z.number().int().optional().describe('HTTP status code'),
    type: z
      .enum(['http', 'graphql', 'network', 'unknown'])
      .describe('GitHub API error category'),
    scopesSuggestion: z
      .string()
      .optional()
      .describe('Suggested scopes needed to resolve the error'),
    rateLimitRemaining: z
      .number()
      .optional()
      .describe('Remaining API requests in the current rate limit window'),
    rateLimitReset: z
      .number()
      .optional()
      .describe('Rate limit reset time in milliseconds since epoch'),
    retryAfter: z.number().optional().describe('Retry-after delay in seconds'),
    hints: z.array(z.string()).optional().describe('Provider-specific hints'),
  })
  .strict();

export const ErrorDataSchema = z
  .object({
    error: z
      .union([z.string(), GitHubApiErrorSchema])
      .describe('Error message or API error object'),
    hints: z.array(z.string()).optional().describe('Recovery hints'),
    errorType: z
      .string()
      .optional()
      .describe('Tool-specific error type (e.g. symbol_not_found, size_limit)'),
    errorCode: z.string().optional().describe('Tool error code'),
    resolvedPath: z
      .string()
      .optional()
      .describe('Resolved filesystem path involved in the error'),
    cwd: z
      .string()
      .optional()
      .describe('Working directory relevant to the error'),
    searchRadius: z
      .number()
      .optional()
      .describe('LSP search radius when symbol not found'),
  })
  .strict();

export const EmptyDataSchema = z
  .object({})
  .catchall(z.unknown())
  .describe('Empty result metadata (may contain hints or paging details)');

function createBulkOutputSchema(successDataSchema: z.ZodType<object>) {
  const hasResultsSchema = QueryMetaSchema.extend({
    status: z
      .literal('hasResults')
      .describe('Indicates the query returned results successfully'),
    data: successDataSchema.describe('The tool-specific result data'),
  }).strict();

  const emptySchema = QueryMetaSchema.extend({
    status: z
      .literal('empty')
      .describe('Indicates the query returned no matching results'),
    data: EmptyDataSchema,
  }).strict();

  const errorSchema = QueryMetaSchema.extend({
    status: z
      .literal('error')
      .describe('Indicates the query encountered an error'),
    data: ErrorDataSchema.describe(
      'Error details including message, type, and recovery hints'
    ),
  }).strict();

  return z
    .object({
      results: z
        .array(
          z.discriminatedUnion('status', [
            hasResultsSchema,
            emptySchema,
            errorSchema,
          ])
        )
        .describe(
          'Array of results, one per input query, discriminated by status'
        ),
      responsePagination: CharPaginationSchema.optional().describe(
        'Pagination metadata for top-level bulk response pagination across results[]'
      ),
    })
    .strict();
}

export const BasePaginationSchema = z
  .object({
    currentPage: z
      .number()
      .int()
      .positive()
      .describe('Current page number (1-indexed)'),
    totalPages: z
      .number()
      .int()
      .positive()
      .describe('Total number of pages available'),
    hasMore: z
      .boolean()
      .describe('Whether more pages are available after the current page'),
  })
  .strict();

export const SearchPaginationSchema = BasePaginationSchema.extend({
  perPage: z.number().int().positive().describe('Results returned per page'),
  totalMatches: z
    .number()
    .int()
    .nonnegative()
    .describe('Total matching results across all pages'),
}).strict();

export const FilesPaginationSchema = BasePaginationSchema.extend({
  filesPerPage: z.number().int().positive().describe('Files returned per page'),
  totalFiles: z
    .number()
    .int()
    .nonnegative()
    .describe('Total matching files across all pages'),
}).strict();

export const EntriesPaginationSchema = BasePaginationSchema.extend({
  entriesPerPage: z
    .number()
    .int()
    .positive()
    .describe('Directory entries returned per page'),
  totalEntries: z
    .number()
    .int()
    .nonnegative()
    .describe('Total matching entries across all pages'),
}).strict();

export const MatchPaginationSchema = BasePaginationSchema.extend({
  matchesPerPage: z
    .number()
    .int()
    .positive()
    .describe('Matches returned per page within a single file'),
  totalMatches: z
    .number()
    .int()
    .nonnegative()
    .describe('Total matches within the file'),
}).strict();

export const CharPaginationSchema = BasePaginationSchema.extend({
  charOffset: z
    .number()
    .int()
    .nonnegative()
    .describe('Character offset of the current page'),
  charLength: z
    .number()
    .int()
    .nonnegative()
    .describe('Character length of the current page'),
  totalChars: z
    .number()
    .int()
    .nonnegative()
    .describe('Total number of characters in the full output'),
}).strict();

export const ContentPaginationSchema = BasePaginationSchema.extend({
  byteOffset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Byte offset of the current page'),
  byteLength: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Byte length of the current page'),
  totalBytes: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Total number of bytes in the full output'),
  charOffset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Character offset of the current page'),
  charLength: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Character length of the current page'),
  totalChars: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Total number of characters in the full output'),
}).strict();

export const LspPaginationSchema = BasePaginationSchema.extend({
  totalResults: z
    .number()
    .int()
    .nonnegative()
    .describe('Total matching locations or calls across all pages'),
  resultsPerPage: z
    .number()
    .int()
    .positive()
    .describe('Locations or calls returned per page'),
}).strict();

export const LspExactPositionSchema = z
  .object({
    line: z.number().int().nonnegative().describe('Zero-based line number'),
    character: z
      .number()
      .int()
      .nonnegative()
      .describe('Zero-based character offset'),
  })
  .strict();

export const LspRangeSchema = z
  .object({
    start: LspExactPositionSchema.describe('Start position of the range'),
    end: LspExactPositionSchema.describe('End position of the range'),
  })
  .strict()
  .describe('A range in a text document expressed as start and end positions');

export const LspSymbolKindSchema = z.enum([
  'function',
  'method',
  'class',
  'interface',
  'type',
  'variable',
  'constant',
  'property',
  'enum',
  'module',
  'namespace',
  'unknown',
]);

export const LspCodeSnippetSchema = z
  .object({
    uri: z.string().describe('File URI where the code snippet is located'),
    range: LspRangeSchema.describe('Position range of the symbol in the file'),
    content: z
      .string()
      .describe('Source code content at the location with surrounding context'),
    symbolKind: LspSymbolKindSchema.optional().describe(
      'LSP symbol kind (e.g. function, class, variable, method)'
    ),
  })
  .strict();

export const LspReferenceLocationSchema = LspCodeSnippetSchema.extend({
  isDefinition: z
    .boolean()
    .optional()
    .describe('Whether this reference is the symbol definition itself'),
}).strict();

export const LspCallHierarchyItemSchema = z
  .object({
    name: z.string().describe('Function or method name'),
    kind: LspSymbolKindSchema.describe('Symbol kind of the item'),
    uri: z.string().describe('File URI containing the item'),
    range: LspRangeSchema.describe('Range of the item in the file'),
    content: z
      .string()
      .optional()
      .describe('Source code context around the item'),
  })
  .strict();

export const LspIncomingCallSchema = z
  .object({
    from: LspCallHierarchyItemSchema.describe('Caller item'),
    fromRanges: z
      .array(LspRangeSchema)
      .describe('Ranges inside the caller where the target is called'),
  })
  .strict();

export const LspOutgoingCallSchema = z
  .object({
    to: LspCallHierarchyItemSchema.describe('Callee item'),
    fromRanges: z
      .array(LspRangeSchema)
      .describe('Ranges inside the target where the outgoing call is made'),
  })
  .strict();

export const GitHubDirectoryFileEntrySchema = z
  .object({
    path: z.string().describe('Relative path within the fetched directory'),
    size: z.number().int().nonnegative().describe('File size in bytes'),
    type: z.literal('file').describe('Directory fetch only returns files'),
  })
  .strict();

export const GitHubCodeSearchFileSchema = z
  .object({
    path: z.string().describe('Path of the matching file in the repository'),
    owner: z.string().optional().describe('Repository owner'),
    repo: z.string().optional().describe('Repository name'),
    text_matches: z
      .array(z.string())
      .optional()
      .describe('Matched code snippets when searching file content'),
    lastModifiedAt: z
      .string()
      .optional()
      .describe('Last modified timestamp for the file'),
  })
  .strict();

export const GitHubCodeSearchRepositoryContextSchema = z
  .object({
    branch: z.string().describe('Default branch of the repository'),
  })
  .strict();

export const GitHubPullRequestCommentSchema = z
  .object({
    id: z.string().describe('Comment identifier'),
    author: z.string().describe('Comment author username'),
    body: z.string().describe('Comment body'),
    createdAt: z.string().describe('Comment creation timestamp'),
    updatedAt: z.string().describe('Comment update timestamp'),
  })
  .strict();

export const GitHubPullRequestFileChangeSchema = z
  .object({
    path: z.string().describe('File path inside the pull request diff'),
    status: z.string().describe('Git change status for the file'),
    additions: z
      .number()
      .int()
      .nonnegative()
      .describe('Lines added in this file'),
    deletions: z
      .number()
      .int()
      .nonnegative()
      .describe('Lines deleted in this file'),
    patch: z.string().optional().describe('Diff patch for the file'),
  })
  .strict();

export const GitHubPullRequestOutputSchema = z
  .object({
    number: z.number().int().positive().describe('Pull request number'),
    title: z.string().describe('Pull request title'),
    body: z.string().nullable().optional().describe('Pull request body'),
    url: z.string().describe('Web URL for the pull request'),
    state: z.enum(['open', 'closed', 'merged']).describe('Pull request state'),
    draft: z.boolean().describe('Whether the pull request is a draft'),
    author: z.string().describe('Author username'),
    assignees: z.array(z.string()).optional().describe('Assigned usernames'),
    labels: z.array(z.string()).optional().describe('Applied label names'),
    sourceBranch: z.string().describe('Source branch name'),
    targetBranch: z.string().describe('Target branch name'),
    sourceSha: z.string().optional().describe('Source branch commit SHA'),
    targetSha: z.string().optional().describe('Target branch commit SHA'),
    createdAt: z.string().describe('Creation timestamp'),
    updatedAt: z.string().describe('Last update timestamp'),
    closedAt: z.string().optional().describe('Closed timestamp'),
    mergedAt: z.string().optional().describe('Merged timestamp'),
    commentsCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Number of comments on the pull request'),
    changedFilesCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Number of changed files'),
    additions: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Lines added across the pull request'),
    deletions: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Lines deleted across the pull request'),
    comments: z
      .array(GitHubPullRequestCommentSchema)
      .optional()
      .describe('Expanded pull request comments'),
    fileChanges: z
      .array(GitHubPullRequestFileChangeSchema)
      .optional()
      .describe('Expanded changed-file details'),
  })
  .strict();

export const GitHubRepositoryOutputSchema = z
  .object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    defaultBranch: z
      .string()
      .optional()
      .describe('Default branch of the repository'),
    stars: z.number().int().nonnegative().describe('Star count'),
    description: z.string().describe('Repository description'),
    url: z.string().describe('Web URL for the repository'),
    createdAt: z.string().describe('Creation timestamp'),
    updatedAt: z.string().describe('Last update timestamp'),
    pushedAt: z.string().describe('Last push timestamp'),
    visibility: z
      .enum(['public', 'private', 'internal'])
      .optional()
      .describe('Repository visibility'),
    topics: z.array(z.string()).optional().describe('Repository topics'),
    forksCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Fork count'),
    openIssuesCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Open issues count'),
  })
  .strict();

export const GitHubRepoStructureDirectoryEntrySchema = z
  .object({
    files: z.array(z.string()).describe('File names in the directory'),
    folders: z
      .array(z.string())
      .describe('Subdirectory names in the directory'),
  })
  .strict();

export const GitHubRepoStructureSummarySchema = z
  .object({
    totalFiles: z
      .number()
      .int()
      .nonnegative()
      .describe('Total files included in the structure result'),
    totalFolders: z
      .number()
      .int()
      .nonnegative()
      .describe('Total folders included in the structure result'),
    truncated: z
      .boolean()
      .describe('Whether the provider truncated the structure result'),
  })
  .strict();

export const GitHubBranchFallbackSchema = z
  .object({
    requestedBranch: z.string().describe('Branch requested in the query'),
    actualBranch: z.string().describe('Branch actually used in the result'),
    defaultBranch: z
      .string()
      .optional()
      .describe('Repository default branch when known'),
    warning: z
      .string()
      .describe('Human-readable explanation of the branch fallback'),
  })
  .strict();

export const PackageSearchPackageSchema = z
  .object({
    name: z.string().describe('Package name'),
    repository: z
      .string()
      .nullable()
      .optional()
      .describe('Repository URL when available'),
    repoUrl: z
      .string()
      .nullable()
      .optional()
      .describe('Normalized repository URL when available'),
    owner: z
      .string()
      .optional()
      .describe('Repository owner parsed from the repository URL'),
    repo: z
      .string()
      .optional()
      .describe('Repository name parsed from the repository URL'),
    path: z
      .string()
      .optional()
      .describe('NPM package path or repository subdirectory'),
    version: z.string().optional().describe('Package version'),
    description: z
      .string()
      .nullable()
      .optional()
      .describe('Package description'),
    homepage: z.string().optional().describe('Package homepage'),
    mainEntry: z
      .string()
      .nullable()
      .optional()
      .describe('Main entry point for NPM packages'),
    typeDefinitions: z
      .string()
      .nullable()
      .optional()
      .describe('Type definition entry point for NPM packages'),
    lastPublished: z.string().optional().describe('Last published timestamp'),
    license: z.string().optional().describe('Package license'),
    author: z.string().optional().describe('Package author'),
    keywords: z.array(z.string()).optional().describe('Package keywords'),
    engines: z
      .record(z.string(), z.string())
      .optional()
      .describe('Engine requirements'),
    dependencies: z
      .record(z.string(), z.string())
      .optional()
      .describe('Declared dependencies'),
    peerDependencies: z
      .record(z.string(), z.string())
      .optional()
      .describe('Declared peer dependencies'),
  })
  .strict();

export const LocalSearchCodeMatchSchema = z
  .object({
    value: z.string().describe('Matched line content with surrounding context'),
    line: z
      .number()
      .int()
      .positive()
      .describe('1-indexed line number of the match'),
    column: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Zero-based column position of the match'),
  })
  .strict();

export const LocalSearchCodeFileSchema = z
  .object({
    path: z.string().describe('Absolute file path'),
    matchCount: z
      .number()
      .int()
      .nonnegative()
      .describe('Total matches found in the file'),
    matches: z
      .array(LocalSearchCodeMatchSchema)
      .describe('Matches returned for this file page'),
    modified: z
      .string()
      .optional()
      .describe('Last modified timestamp of the file'),
    pagination: MatchPaginationSchema.optional().describe(
      'Per-file match pagination when more matches are available'
    ),
  })
  .strict();

export const LocalMatchRangeSchema = z
  .object({
    start: z
      .number()
      .int()
      .positive()
      .describe('Start line number of a matched range'),
    end: z
      .number()
      .int()
      .positive()
      .describe('End line number of a matched range'),
  })
  .strict();

export const LocalFindFilesEntrySchema = z
  .object({
    path: z.string().describe('Absolute file path'),
    type: z
      .enum(['file', 'directory', 'symlink'])
      .describe('Filesystem entry type'),
    size: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Entry size in bytes'),
    modified: z.string().optional().describe('Last modified timestamp'),
    permissions: z.string().optional().describe('POSIX permissions string'),
  })
  .strict();

export const LocalViewStructureEntrySchema = z
  .object({
    name: z.string().describe('Entry name'),
    type: z.enum(['file', 'dir', 'link']).describe('Directory entry type'),
    depth: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Depth relative to the queried path'),
    size: z.string().optional().describe('Human-readable size when requested'),
    modified: z
      .string()
      .optional()
      .describe('Last modified timestamp when requested'),
    permissions: z
      .string()
      .optional()
      .describe('POSIX permissions string when requested'),
  })
  .strict();

/**
 * Shared fallback output schema.
 */
export const BulkToolDataSchema = z.object({}).catchall(z.unknown());

export const BulkToolOutputSchema = createBulkOutputSchema(BulkToolDataSchema);

export const GitHubFetchContentDataSchema = z
  .object({
    resolvedBranch: z
      .string()
      .optional()
      .describe(
        'Resolved branch used to fetch the content when it adds new information beyond the input query'
      ),
    content: z
      .string()
      .optional()
      .describe('File content as text for single-file requests'),
    isPartial: z
      .boolean()
      .optional()
      .describe('Whether the returned file content is partial'),
    startLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Starting line number of the returned content'),
    endLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Ending line number of the returned content'),
    lastModified: z
      .string()
      .optional()
      .describe('Last modified timestamp for the file'),
    lastModifiedBy: z
      .string()
      .optional()
      .describe('Author of the last file modification'),
    localPath: z
      .string()
      .optional()
      .describe('Local filesystem path for directory fetch mode'),
    files: z
      .array(GitHubDirectoryFileEntrySchema)
      .optional()
      .describe('Files fetched in directory mode'),
    fileCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Number of files fetched in directory mode'),
    totalSize: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Total fetched size in bytes'),
    cached: z
      .boolean()
      .optional()
      .describe('Whether a cached fetch was reused'),
    pagination: ContentPaginationSchema.optional().describe(
      'Pagination metadata for partial file content'
    ),
    hints: HintsSchema,
  })
  .strict();

export const GitHubFetchContentOutputSchema = createBulkOutputSchema(
  GitHubFetchContentDataSchema
);

export const GitHubSearchCodeDataSchema = z
  .object({
    files: z
      .array(GitHubCodeSearchFileSchema)
      .optional()
      .describe('Matching files with repository context and snippets'),
    repositoryContext:
      GitHubCodeSearchRepositoryContextSchema.optional().describe(
        'Repository context metadata for single-repository searches'
      ),
    pagination: SearchPaginationSchema.optional().describe(
      'Pagination info for navigating through search results'
    ),
    outputPagination: CharPaginationSchema.optional().describe(
      'Payload pagination metadata when the result body was size-paginated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const GitHubSearchCodeOutputSchema = createBulkOutputSchema(
  GitHubSearchCodeDataSchema
);

export const GitHubSearchPullRequestsDataSchema = z
  .object({
    pull_requests: z
      .array(GitHubPullRequestOutputSchema)
      .optional()
      .describe('Pull request results'),
    total_count: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Total number of matching pull requests'),
    pagination: SearchPaginationSchema.optional().describe(
      'Pagination info for navigating through pull request results'
    ),
    outputPagination: CharPaginationSchema.optional().describe(
      'Output pagination metadata when the rendered payload was truncated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const GitHubSearchPullRequestsOutputSchema = createBulkOutputSchema(
  GitHubSearchPullRequestsDataSchema
);

export const GitHubSearchRepositoriesDataSchema = z
  .object({
    repositories: z
      .array(GitHubRepositoryOutputSchema)
      .describe('Matching repositories'),
    pagination: SearchPaginationSchema.optional().describe(
      'Pagination info for navigating through repository results'
    ),
    outputPagination: CharPaginationSchema.optional().describe(
      'Payload pagination metadata when the result body was size-paginated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const GitHubSearchRepositoriesOutputSchema = createBulkOutputSchema(
  GitHubSearchRepositoriesDataSchema
);

export const GitHubViewRepoStructureDataSchema = z
  .object({
    resolvedBranch: z
      .string()
      .optional()
      .describe('Resolved branch used when the input query omitted a branch'),
    branchFallback: GitHubBranchFallbackSchema.optional().describe(
      'Branch fallback details when the requested branch was not used'
    ),
    structure: z
      .record(z.string(), GitHubRepoStructureDirectoryEntrySchema)
      .optional()
      .describe('Directory structure grouped by relative path'),
    summary: GitHubRepoStructureSummarySchema.optional().describe(
      'Summary statistics for the returned repository structure'
    ),
    pagination: EntriesPaginationSchema.optional().describe(
      'Pagination info for large directory listings'
    ),
    outputPagination: CharPaginationSchema.optional().describe(
      'Payload pagination metadata when the structure payload was size-paginated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const GitHubViewRepoStructureOutputSchema = createBulkOutputSchema(
  GitHubViewRepoStructureDataSchema
);

export const GitHubCloneRepoDataSchema = z
  .object({
    localPath: z
      .string()
      .describe('Local filesystem path where the repository was cloned to'),
    resolvedBranch: z
      .string()
      .optional()
      .describe(
        'Resolved branch used for the clone when it adds new information beyond the input query'
      ),
    cached: z
      .boolean()
      .optional()
      .describe(
        'Whether the clone was served from cache instead of a fresh clone'
      ),
    outputPagination: CharPaginationSchema.optional().describe(
      'Payload pagination metadata when the clone result body was size-paginated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const GitHubCloneRepoOutputSchema = createBulkOutputSchema(
  GitHubCloneRepoDataSchema
);

export const PackageSearchDataSchema = z
  .object({
    packages: z.array(PackageSearchPackageSchema).describe('Matching packages'),
    totalFound: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Total number of packages matching the search query'),
    outputPagination: CharPaginationSchema.optional().describe(
      'Payload pagination metadata when the package list was size-paginated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const PackageSearchOutputSchema = createBulkOutputSchema(
  PackageSearchDataSchema
);

export const LocalSearchCodeDataSchema = z
  .object({
    files: z
      .array(LocalSearchCodeFileSchema)
      .optional()
      .describe('Matching files grouped with their matches'),
    searchEngine: z
      .enum(['rg', 'grep'])
      .optional()
      .describe('Search engine that produced the result'),
    pagination: FilesPaginationSchema.optional().describe(
      'Pagination info for navigating through matching files'
    ),
    warnings: z
      .array(z.string())
      .optional()
      .describe(
        'Warnings about skipped files, permission errors, or truncated results'
      ),
    outputPagination: CharPaginationSchema.optional().describe(
      'Payload pagination metadata when the result body was size-paginated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const LocalSearchCodeOutputSchema = createBulkOutputSchema(
  LocalSearchCodeDataSchema
);

export const LocalGetFileContentDataSchema = z
  .object({
    content: z
      .string()
      .optional()
      .describe(
        'File content (full or partial depending on request parameters)'
      ),
    isPartial: z
      .boolean()
      .optional()
      .describe('Whether the returned content is a partial view of the file'),
    totalLines: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Total number of lines in the file'),
    startLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Starting line number of the returned content (1-indexed)'),
    endLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Ending line number of the returned content (1-indexed)'),
    matchRanges: z
      .array(LocalMatchRangeSchema)
      .optional()
      .describe('Matched line ranges when using matchString'),
    pagination: ContentPaginationSchema.optional().describe(
      'Pagination info for large files or matchString results'
    ),
    warnings: z
      .array(z.string())
      .optional()
      .describe('Warnings about truncation or auto-pagination'),
    hints: HintsSchema,
  })
  .strict();

export const LocalGetFileContentOutputSchema = createBulkOutputSchema(
  LocalGetFileContentDataSchema
);

export const LocalFindFilesDataSchema = z
  .object({
    files: z
      .array(LocalFindFilesEntrySchema)
      .optional()
      .describe('Matching filesystem entries'),
    pagination: FilesPaginationSchema.optional().describe(
      'Pagination info for navigating through file results'
    ),
    outputPagination: ContentPaginationSchema.optional().describe(
      'Payload pagination metadata when the result body was size-paginated'
    ),
    charPagination: ContentPaginationSchema.optional().describe(
      'Legacy compatibility alias for outputPagination'
    ),
    hints: HintsSchema,
  })
  .strict();

export const LocalFindFilesOutputSchema = createBulkOutputSchema(
  LocalFindFilesDataSchema
);

export const LocalViewStructureDataSchema = z
  .object({
    entries: z
      .array(LocalViewStructureEntrySchema)
      .optional()
      .describe('Directory entries for the requested path'),
    summary: z
      .string()
      .optional()
      .describe('Human-readable summary of the directory structure'),
    pagination: EntriesPaginationSchema.optional().describe(
      'Pagination info for large directory listings'
    ),
    warnings: z
      .array(z.string())
      .optional()
      .describe('Warnings about skipped or inaccessible entries'),
    outputPagination: CharPaginationSchema.optional().describe(
      'Payload pagination metadata when the result body was size-paginated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const LocalViewStructureOutputSchema = createBulkOutputSchema(
  LocalViewStructureDataSchema
);

export const LspGotoDefinitionDataSchema = z
  .object({
    locations: z
      .array(LspCodeSnippetSchema)
      .optional()
      .describe('Definition locations with snippets'),
    resolvedPosition: LspExactPositionSchema.optional().describe(
      'The exact position that was resolved for the symbol lookup'
    ),
    searchRadius: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        'Number of lines searched around the lineHint to find the symbol'
      ),
    outputPagination: CharPaginationSchema.optional().describe(
      'Pagination for large definition results'
    ),
    hints: HintsSchema,
  })
  .strict();

export const LspGotoDefinitionOutputSchema = createBulkOutputSchema(
  LspGotoDefinitionDataSchema
);

export const LspFindReferencesDataSchema = z
  .object({
    locations: z
      .array(LspReferenceLocationSchema)
      .optional()
      .describe('Reference locations with snippets'),
    pagination: LspPaginationSchema.optional().describe(
      'Pagination info for navigating through reference results'
    ),
    totalReferences: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Total references found across all files'),
    hasMultipleFiles: z
      .boolean()
      .optional()
      .describe('Whether references span multiple files'),
    outputPagination: CharPaginationSchema.optional().describe(
      'Payload pagination metadata when the result body was size-paginated'
    ),
    hints: HintsSchema,
  })
  .strict();

export const LspFindReferencesOutputSchema = createBulkOutputSchema(
  LspFindReferencesDataSchema
);

export const LspCallHierarchyDataSchema = z
  .object({
    item: LspCallHierarchyItemSchema.optional().describe(
      'Target call hierarchy item'
    ),
    incomingCalls: z
      .array(LspIncomingCallSchema)
      .optional()
      .describe('Callers of the target item'),
    outgoingCalls: z
      .array(LspOutgoingCallSchema)
      .optional()
      .describe('Callees called by the target item'),
    pagination: LspPaginationSchema.optional().describe(
      'Pagination info for navigating through call hierarchy results'
    ),
    outputPagination: CharPaginationSchema.optional().describe(
      'Pagination for large call hierarchy output'
    ),
    direction: z
      .enum(['incoming', 'outgoing'])
      .optional()
      .describe('Direction of the hierarchy traversal'),
    depth: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Traversal depth performed for the hierarchy search'),
    hints: HintsSchema,
  })
  .strict();

export const LspCallHierarchyOutputSchema = createBulkOutputSchema(
  LspCallHierarchyDataSchema
);
