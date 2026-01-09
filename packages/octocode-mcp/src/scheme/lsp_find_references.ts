/**
 * Schema for lspFindReferences tool
 */

import { z } from 'zod';
import { BaseQuerySchemaLocal, createBulkQuerySchema } from './baseSchema.js';
import { STATIC_TOOL_NAMES } from '../tools/toolNames.js';
import { LSP_FIND_REFERENCES, DESCRIPTIONS } from '../tools/toolMetadata.js';

/**
 * Tool description for lspFindReferences
 */
export const LSP_FIND_REFERENCES_DESCRIPTION =
  DESCRIPTIONS[STATIC_TOOL_NAMES.LSP_FIND_REFERENCES];

/**
 * Base schema for LSP find references query
 */
const LSPFindReferencesBaseSchema = BaseQuerySchemaLocal.extend({
  uri: z.string().min(1).describe(LSP_FIND_REFERENCES.scope.uri),

  symbolName: z
    .string()
    .min(1)
    .max(255)
    .describe(LSP_FIND_REFERENCES.scope.symbolName),

  lineHint: z
    .number()
    .int()
    .min(1)
    .describe(LSP_FIND_REFERENCES.scope.lineHint),

  orderHint: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(LSP_FIND_REFERENCES.options.orderHint),

  includeDeclaration: z
    .boolean()
    .optional()
    .default(true)
    .describe(LSP_FIND_REFERENCES.options.includeDeclaration),

  contextLines: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(2)
    .describe(LSP_FIND_REFERENCES.options.contextLines),

  referencesPerPage: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe(LSP_FIND_REFERENCES.pagination.referencesPerPage),

  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(LSP_FIND_REFERENCES.pagination.page),
});

/**
 * Single query schema for LSP find references
 */
const LSPFindReferencesQuerySchema = LSPFindReferencesBaseSchema;

/**
 * Bulk query schema for finding references across multiple symbols
 */
export const BulkLSPFindReferencesSchema = createBulkQuerySchema(
  STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
  LSPFindReferencesQuerySchema,
  { maxQueries: 5 }
);

export type LSPFindReferencesQuery = z.infer<
  typeof LSPFindReferencesQuerySchema
>;
