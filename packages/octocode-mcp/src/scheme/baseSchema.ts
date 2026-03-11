import { z } from 'zod/v4';
import { BASE_SCHEMA } from '../tools/toolMetadata/index.js';

const QUERY_ID_DESCRIPTION =
  'Stable query identifier used to match each result to its input query. Required for every query. Use a short meaningful string like "react_hooks_search" or "router_prs".';

const QueryIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[A-Za-z0-9._:-]+$/,
    'id must contain only letters, numbers, dot, underscore, colon, or dash'
  )
  .describe(QUERY_ID_DESCRIPTION);

export const BaseQuerySchema = z.object({
  id: QueryIdSchema,
  mainResearchGoal: z.string().describe(BASE_SCHEMA.mainResearchGoal),
  researchGoal: z.string().describe(BASE_SCHEMA.researchGoal),
  reasoning: z.string().describe(BASE_SCHEMA.reasoning),
});

/**
 * Base query schema for local tools with required research context
 */
export const BaseQuerySchemaLocal = z.object({
  id: QueryIdSchema,
  researchGoal: z.string().describe(BASE_SCHEMA.researchGoal),
  reasoning: z.string().describe(BASE_SCHEMA.reasoning),
});

/**
 * Options for bulk query schema creation
 */
interface BulkQuerySchemaOptions {
  /** Maximum number of queries allowed (default: 3 for GitHub tools) */
  maxQueries?: number;
  /** Custom description prefix (default: uses BASE_SCHEMA.bulkQuery for GitHub) */
  descriptionPrefix?: string;
}

/**
 * Creates a bulk query schema with configurable max queries
 * @param toolName - Name of the tool for description
 * @param singleQuerySchema - Schema for a single query
 * @param options - Configuration options (maxQueries defaults to 3)
 */
export function createBulkQuerySchema<T extends z.ZodType<object>>(
  toolName: string,
  singleQuerySchema: T,
  options: BulkQuerySchemaOptions = {}
) {
  const { maxQueries = 3, descriptionPrefix } = options;
  const description =
    descriptionPrefix ??
    (maxQueries === 3
      ? BASE_SCHEMA.bulkQuery(toolName)
      : `Queries for ${toolName} (1–${maxQueries} per call). Review schema before use.`);

  return z
    .object({
      queries: z
        .array(singleQuerySchema)
        .min(1)
        .max(maxQueries)
        .describe(description),
    })
    .superRefine((value, ctx) => {
      const seenIds = new Set<string>();

      value.queries.forEach((query, index) => {
        const queryId =
          typeof query === 'object' &&
          query !== null &&
          'id' in query &&
          typeof (query as { id?: unknown }).id === 'string'
            ? (query as { id: string }).id
            : undefined;

        if (!queryId) return;
        if (seenIds.has(queryId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['queries', index, 'id'],
            message: `Duplicate query id "${queryId}". Query ids must be unique within a single call.`,
          });
          return;
        }

        seenIds.add(queryId);
      });
    });
}
