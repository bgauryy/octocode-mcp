/**
 * Schema for lspGotoDefinition tool
 */

import { z } from 'zod';
import {
  BaseQuerySchemaLocal,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { LSP_GOTO_DEFINITION, DESCRIPTIONS } from '../toolMetadata.js';

/**
 * Tool description for lspGotoDefinition
 */
export const LSP_GOTO_DEFINITION_DESCRIPTION =
  DESCRIPTIONS[STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION];

/**
 * Base schema for LSP goto definition query
 */
const LSPGotoDefinitionBaseSchema = BaseQuerySchemaLocal.extend({
  uri: z.string().min(1).describe(LSP_GOTO_DEFINITION.scope.uri),

  symbolName: z
    .string()
    .min(1)
    .max(255)
    .describe(LSP_GOTO_DEFINITION.scope.symbolName),

  lineHint: z
    .number()
    .int()
    .min(1)
    .describe(LSP_GOTO_DEFINITION.scope.lineHint),

  orderHint: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(LSP_GOTO_DEFINITION.options.orderHint),

  contextLines: z
    .number()
    .int()
    .min(0)
    .max(20)
    .default(5)
    .describe(LSP_GOTO_DEFINITION.options.contextLines),
});

/**
 * Single query schema for LSP goto definition
 */
export const LSPGotoDefinitionQuerySchema = LSPGotoDefinitionBaseSchema;

/**
 * Bulk query schema for LSP goto definition (max 5 queries)
 */
export const BulkLSPGotoDefinitionSchema = createBulkQuerySchema(
  STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
  LSPGotoDefinitionQuerySchema,
  { maxQueries: 5 }
);

export type LSPGotoDefinitionQuery = z.infer<
  typeof LSPGotoDefinitionQuerySchema
>;
