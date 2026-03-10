import { z } from 'zod';

const QueryMetaSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('Stable query identifier matching the input query id'),
});

const HintsSchema = z
  .array(z.string())
  .optional()
  .describe(
    'Contextual hints and suggestions for next steps or better queries'
  );

const ErrorDataSchema = z
  .object({
    error: z
      .union([z.string(), z.record(z.unknown())])
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
  .passthrough();

function createBulkOutputSchema(successDataSchema: z.ZodTypeAny) {
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
    data: z
      .record(z.unknown())
      .describe('Empty result metadata (may contain hints)'),
  }).strict();

  const errorSchema = QueryMetaSchema.extend({
    status: z
      .literal('error')
      .describe('Indicates the query encountered an error'),
    data: ErrorDataSchema.describe(
      'Error details including message, type, and recovery hints'
    ),
  }).strict();

  return z.object({
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
  }).strict();
}

const CommonPaginationSchema = z
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
  .passthrough();

const LspRangeSchema = z
  .object({
    start: z
      .object({
        line: z
          .number()
          .int()
          .nonnegative()
          .describe('Zero-based start line number'),
        character: z
          .number()
          .int()
          .nonnegative()
          .describe('Zero-based start character offset'),
      })
      .describe('Start position of the range'),
    end: z
      .object({
        line: z
          .number()
          .int()
          .nonnegative()
          .describe('Zero-based end line number'),
        character: z
          .number()
          .int()
          .nonnegative()
          .describe('Zero-based end character offset'),
      })
      .describe('End position of the range'),
  })
  .describe('A range in a text document expressed as start and end positions');

const LspCodeSnippetSchema = z
  .object({
    uri: z.string().describe('File URI where the code snippet is located'),
    range: LspRangeSchema.describe('Position range of the symbol in the file'),
    content: z
      .string()
      .describe('Source code content at the location with surrounding context'),
    symbolKind: z
      .string()
      .optional()
      .describe('LSP symbol kind (e.g. Function, Class, Variable, Method)'),
  })
  .passthrough();

/**
 * Shared fallback output schema.
 */
export const BulkToolOutputSchema = createBulkOutputSchema(
  z.record(z.unknown())
);

export const GitHubFetchContentOutputSchema = createBulkOutputSchema(
  z
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
        .describe('File content as text (for single file requests)'),
      localPath: z
        .string()
        .optional()
        .describe('Local filesystem path when using directory download mode'),
      files: z
        .array(z.record(z.unknown()))
        .optional()
        .describe('Array of file objects when fetching directory content'),
      fileCount: z
        .number()
        .optional()
        .describe('Total number of files in the directory'),
      totalSize: z
        .number()
        .optional()
        .describe('Total size of all files in bytes'),
      cached: z
        .boolean()
        .optional()
        .describe('Whether a cached local directory fetch was reused'),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination for input results (API-level paging)'
      ),
      outputPagination: CommonPaginationSchema.optional().describe(
        'Pagination for output content (content-level paging within a single result)'
      ),
      hints: HintsSchema,
    })
);

export const GitHubSearchCodeOutputSchema = createBulkOutputSchema(
  z
    .object({
      files: z
        .array(z.record(z.unknown()))
        .optional()
        .describe(
          'Array of matching files with path, repository, and text match details'
        ),
      repositoryContext: z
        .object({
          branch: z.string().describe('Default branch of the repository'),
        })
        .optional()
        .describe('Repository context metadata for the search results'),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for navigating through search results'
      ),
      hints: HintsSchema,
    })
);

export const GitHubSearchPullRequestsOutputSchema = createBulkOutputSchema(
  z
    .object({
      pull_requests: z
        .array(z.record(z.unknown()))
        .optional()
        .describe(
          'Array of pull request objects with title, state, author, labels, and diff details'
        ),
      total_count: z
        .number()
        .optional()
        .describe('Total number of pull requests matching the search query'),
      incomplete_results: z
        .boolean()
        .optional()
        .describe(
          'Whether the GitHub API returned incomplete results due to timeout'
        ),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for navigating through search results'
      ),
      outputPagination: CommonPaginationSchema.optional().describe(
        'Pagination for PR content (diff/comments paging within a single PR)'
      ),
      hints: HintsSchema,
    })
);

export const GitHubSearchRepositoriesOutputSchema = createBulkOutputSchema(
  z
    .object({
      repositories: z
        .array(z.record(z.unknown()))
        .describe(
          'Array of repository objects with name, owner, description, stars, language, and topics'
        ),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for navigating through search results'
      ),
      hints: HintsSchema,
    })
);

export const GitHubViewRepoStructureOutputSchema = createBulkOutputSchema(
  z
    .object({
      resolvedBranch: z
        .string()
        .optional()
        .describe(
          'Resolved branch used when the input query omitted a branch'
        ),
      branchFallback: z
        .object({
          requestedBranch: z.string().describe('Branch requested in the query'),
          actualBranch: z
            .string()
            .describe('Branch actually used in the result'),
          defaultBranch: z
            .string()
            .optional()
            .describe('Repository default branch when known'),
          warning: z
            .string()
            .describe('Human-readable explanation of the fallback'),
        })
        .optional()
        .describe('Branch fallback details when the requested branch was not used'),
      structure: z
        .record(
          z
            .object({
              files: z
                .array(z.string())
                .describe('List of file names in this directory'),
              folders: z
                .array(z.string())
                .describe('List of subdirectory names in this directory'),
            })
            .describe('Directory listing with files and folders')
        )
        .optional()
        .describe(
          'Map of directory paths to their contents (files and folders)'
        ),
      summary: z
        .record(z.unknown())
        .optional()
        .describe(
          'Summary statistics including total files, folders, and truncation info'
        ),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for large directory listings'
      ),
      hints: HintsSchema,
    })
);

export const GitHubCloneRepoOutputSchema = createBulkOutputSchema(
  z
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
      hints: HintsSchema,
    })
);

export const PackageSearchOutputSchema = createBulkOutputSchema(
  z
    .object({
      packages: z
        .array(z.record(z.unknown()))
        .describe(
          'Array of package objects with name, version, description, repository URL, and metadata'
        ),
      totalFound: z
        .number()
        .optional()
        .describe('Total number of packages matching the search query'),
      hints: HintsSchema,
    })
);

export const LocalSearchCodeOutputSchema = createBulkOutputSchema(
  z
    .object({
      files: z
        .array(z.record(z.unknown()))
        .optional()
        .describe(
          'Array of matching files with path, line numbers, match content, and context'
        ),
      searchEngine: z
        .enum(['rg', 'grep'])
        .optional()
        .describe('Search engine that produced the result'),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for navigating through search results'
      ),
      warnings: z
        .array(z.string())
        .optional()
        .describe(
          'Warnings about skipped files, permission errors, or truncated results'
      ),
      hints: HintsSchema,
    })
);

export const LocalGetFileContentOutputSchema = createBulkOutputSchema(
  z
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
        .optional()
        .describe('Total number of lines in the file'),
      startLine: z
        .number()
        .optional()
        .describe('Starting line number of the returned content (1-indexed)'),
      endLine: z
        .number()
        .optional()
        .describe('Ending line number of the returned content (1-indexed)'),
      matchRanges: z
        .array(
          z
            .object({
              start: z
                .number()
                .describe('Start byte offset of the match within the content'),
              end: z
                .number()
                .describe('End byte offset of the match within the content'),
            })
            .describe('A matched range when using matchString')
        )
        .optional()
        .describe(
          'Byte offset ranges where matchString was found in the content'
        ),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for large files or matchString results'
      ),
      warnings: z
        .array(z.string())
        .optional()
        .describe('Warnings about truncation or auto-pagination'),
      hints: HintsSchema,
    })
);

export const LocalFindFilesOutputSchema = createBulkOutputSchema(
  z
    .object({
      files: z
        .array(z.record(z.unknown()))
        .optional()
        .describe(
          'Array of file objects with path, name, size, permissions, and modification time'
        ),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for navigating through file results'
      ),
      charPagination: CommonPaginationSchema.optional().describe(
        'Character-based pagination info when file results are paginated by output size'
      ),
      hints: HintsSchema,
    })
);

export const LocalViewStructureOutputSchema = createBulkOutputSchema(
  z
    .object({
      entries: z
        .array(z.record(z.unknown()))
        .optional()
        .describe(
          'Array of directory entries with name, type (file/directory), size, and depth'
        ),
      summary: z
        .string()
        .optional()
        .describe('Human-readable summary of the directory structure'),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for large directory listings'
      ),
      warnings: z
        .array(z.string())
        .optional()
        .describe('Warnings about skipped or inaccessible entries'),
      hints: HintsSchema,
    })
);

export const LspGotoDefinitionOutputSchema = createBulkOutputSchema(
  z
    .object({
      locations: z
        .array(LspCodeSnippetSchema)
        .optional()
        .describe(
          'Array of definition locations with file URI, range, and source code snippet'
        ),
      resolvedPosition: z
        .object({
          line: z
            .number()
            .int()
            .nonnegative()
            .describe('Zero-based line number of the resolved symbol position'),
          character: z
            .number()
            .int()
            .nonnegative()
            .describe(
              'Zero-based character offset of the resolved symbol position'
            ),
        })
        .optional()
        .describe('The exact position that was resolved for the symbol lookup'),
      searchRadius: z
        .number()
        .int()
        .optional()
        .describe(
          'Number of lines searched around the lineHint to find the symbol'
        ),
      outputPagination: CommonPaginationSchema.optional().describe(
        'Pagination for definition results when multiple definitions exist'
      ),
      hints: HintsSchema,
    })
);

export const LspFindReferencesOutputSchema = createBulkOutputSchema(
  z
    .object({
      locations: z
        .array(
          LspCodeSnippetSchema.extend({
            isDefinition: z
              .boolean()
              .optional()
              .describe(
                'Whether this reference is the symbol definition itself'
              ),
          })
        )
        .optional()
        .describe(
          'Array of reference locations with file URI, range, source code snippet, and definition flag'
        ),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for navigating through reference results'
      ),
      totalReferences: z
        .number()
        .optional()
        .describe('Total number of references found across all files'),
      hasMultipleFiles: z
        .boolean()
        .optional()
        .describe('Whether references span multiple files'),
      hints: HintsSchema,
    })
);

export const LspCallHierarchyOutputSchema = createBulkOutputSchema(
  z
    .object({
      item: z
        .record(z.unknown())
        .optional()
        .describe(
          'The call hierarchy item for the target symbol (name, kind, URI, range)'
        ),
      incomingCalls: z
        .array(
          z
            .object({
              from: z
                .record(z.unknown())
                .describe(
                  'The calling function/method item (name, kind, URI, range)'
                ),
              fromRanges: z
                .array(LspRangeSchema)
                .describe(
                  'Ranges within the caller where the target symbol is called'
                ),
            })
            .describe('An incoming call relationship')
        )
        .optional()
        .describe('Functions/methods that call the target symbol (callers)'),
      outgoingCalls: z
        .array(
          z
            .object({
              to: z
                .record(z.unknown())
                .describe(
                  'The called function/method item (name, kind, URI, range)'
                ),
              fromRanges: z
                .array(LspRangeSchema)
                .describe(
                  'Ranges within the target where the outgoing call is made'
                ),
            })
            .describe('An outgoing call relationship')
        )
        .optional()
        .describe('Functions/methods called by the target symbol (callees)'),
      pagination: CommonPaginationSchema.optional().describe(
        'Pagination info for navigating through call hierarchy results'
      ),
      outputPagination: CommonPaginationSchema.optional().describe(
        'Pagination for output content within a single result'
      ),
      direction: z
        .enum(['incoming', 'outgoing'])
        .optional()
        .describe('The direction of the call hierarchy traversal'),
      depth: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Depth of the call hierarchy traversal that was performed'),
      hints: HintsSchema,
    })
);
