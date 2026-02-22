import { z } from 'zod';

const QueryMetaSchema = z.object({
  id: z.number().int().positive(),
  mainResearchGoal: z.string().optional(),
  researchGoal: z.string().optional(),
  reasoning: z.string().optional(),
});

const GenericErrorDataSchema = z
  .object({
    error: z.unknown(),
    hints: z.array(z.string()).optional(),
  })
  .passthrough();

function createBulkOutputSchema(successDataSchema: z.ZodTypeAny) {
  const hasResultsSchema = QueryMetaSchema.extend({
    status: z.literal('hasResults'),
    data: successDataSchema,
  });

  const emptySchema = QueryMetaSchema.extend({
    status: z.literal('empty'),
    data: z.record(z.unknown()),
  });

  const errorSchema = QueryMetaSchema.extend({
    status: z.literal('error'),
    data: GenericErrorDataSchema,
  });

  return z.object({
    instructions: z.string(),
    results: z.array(
      z.discriminatedUnion('status', [
        hasResultsSchema,
        emptySchema,
        errorSchema,
      ])
    ),
  });
}

const CommonPaginationSchema = z
  .object({
    currentPage: z.number().int().positive(),
    totalPages: z.number().int().positive(),
    hasMore: z.boolean(),
  })
  .passthrough();

const LspRangeSchema = z.object({
  start: z.object({
    line: z.number().int().nonnegative(),
    character: z.number().int().nonnegative(),
  }),
  end: z.object({
    line: z.number().int().nonnegative(),
    character: z.number().int().nonnegative(),
  }),
});

const LspCodeSnippetSchema = z
  .object({
    uri: z.string(),
    range: LspRangeSchema,
    content: z.string(),
    symbolKind: z.string().optional(),
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
      owner: z.string().optional(),
      repo: z.string().optional(),
      path: z.string().optional(),
      branch: z.string().optional(),
      content: z.string().optional(),
      localPath: z.string().optional(),
      files: z.array(z.record(z.unknown())).optional(),
      fileCount: z.number().optional(),
      totalSize: z.number().optional(),
      pagination: CommonPaginationSchema.optional(),
      outputPagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const GitHubSearchCodeOutputSchema = createBulkOutputSchema(
  z
    .object({
      files: z.array(z.record(z.unknown())).optional(),
      repositoryContext: z.object({ branch: z.string() }).optional(),
      pagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const GitHubSearchPullRequestsOutputSchema = createBulkOutputSchema(
  z
    .object({
      owner: z.string().optional(),
      repo: z.string().optional(),
      pull_requests: z.array(z.record(z.unknown())).optional(),
      total_count: z.number().optional(),
      incomplete_results: z.boolean().optional(),
      pagination: CommonPaginationSchema.optional(),
      outputPagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const GitHubSearchRepositoriesOutputSchema = createBulkOutputSchema(
  z
    .object({
      repositories: z.array(z.record(z.unknown())),
      pagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const GitHubViewRepoStructureOutputSchema = createBulkOutputSchema(
  z
    .object({
      owner: z.string().optional(),
      repo: z.string().optional(),
      branch: z.string().optional(),
      path: z.string().optional(),
      structure: z
        .record(
          z.object({
            files: z.array(z.string()),
            folders: z.array(z.string()),
          })
        )
        .optional(),
      summary: z.record(z.unknown()).optional(),
      pagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const GitHubCloneRepoOutputSchema = createBulkOutputSchema(
  z
    .object({
      localPath: z.string(),
      owner: z.string(),
      repo: z.string(),
      branch: z.string(),
      sparse_path: z.string().optional(),
      cached: z.boolean().optional(),
      files: z.array(z.record(z.unknown())).optional(),
      fileCount: z.number().optional(),
      totalSize: z.number().optional(),
    })
    .passthrough()
);

export const PackageSearchOutputSchema = createBulkOutputSchema(
  z
    .object({
      packages: z.array(z.record(z.unknown())),
      totalFound: z.number().optional(),
    })
    .passthrough()
);

export const LocalSearchCodeOutputSchema = createBulkOutputSchema(
  z
    .object({
      path: z.string().optional(),
      files: z.array(z.record(z.unknown())).optional(),
      pagination: CommonPaginationSchema.optional(),
      stats: z.record(z.unknown()).optional(),
      distribution: z.record(z.unknown()).optional(),
      warnings: z.array(z.string()).optional(),
    })
    .passthrough()
);

export const LocalGetFileContentOutputSchema = createBulkOutputSchema(
  z
    .object({
      path: z.string().optional(),
      content: z.string().optional(),
      isPartial: z.boolean().optional(),
      totalLines: z.number().optional(),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
      matchRanges: z
        .array(z.object({ start: z.number(), end: z.number() }))
        .optional(),
      pagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const LocalFindFilesOutputSchema = createBulkOutputSchema(
  z
    .object({
      files: z.array(z.record(z.unknown())).optional(),
      totalFiles: z.number().optional(),
      pagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const LocalViewStructureOutputSchema = createBulkOutputSchema(
  z
    .object({
      path: z.string().optional(),
      entries: z.array(z.record(z.unknown())).optional(),
      summary: z.string().optional(),
      pagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const LspGotoDefinitionOutputSchema = createBulkOutputSchema(
  z
    .object({
      locations: z.array(LspCodeSnippetSchema).optional(),
      resolvedPosition: z
        .object({
          line: z.number().int().nonnegative(),
          character: z.number().int().nonnegative(),
        })
        .optional(),
      searchRadius: z.number().int().optional(),
      outputPagination: CommonPaginationSchema.optional(),
    })
    .passthrough()
);

export const LspFindReferencesOutputSchema = createBulkOutputSchema(
  z
    .object({
      locations: z
        .array(
          LspCodeSnippetSchema.extend({ isDefinition: z.boolean().optional() })
        )
        .optional(),
      pagination: CommonPaginationSchema.optional(),
      totalReferences: z.number().optional(),
      hasMultipleFiles: z.boolean().optional(),
    })
    .passthrough()
);

export const LspCallHierarchyOutputSchema = createBulkOutputSchema(
  z
    .object({
      item: z.record(z.unknown()).optional(),
      incomingCalls: z
        .array(
          z.object({
            from: z.record(z.unknown()),
            fromRanges: z.array(LspRangeSchema),
          })
        )
        .optional(),
      outgoingCalls: z
        .array(
          z.object({
            to: z.record(z.unknown()),
            fromRanges: z.array(LspRangeSchema),
          })
        )
        .optional(),
      pagination: CommonPaginationSchema.optional(),
      outputPagination: CommonPaginationSchema.optional(),
      direction: z.enum(['incoming', 'outgoing']).optional(),
      depth: z.number().int().positive().optional(),
    })
    .passthrough()
);
