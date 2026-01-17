/**
 * Schema for lspCallHierarchy tool
 */

import { z } from 'zod';
import {
  BaseQuerySchemaLocal,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { LSP_CALL_HIERARCHY, DESCRIPTIONS } from '../toolMetadata.js';

/**
 * Tool description for lspCallHierarchy
 */
export const LSP_CALL_HIERARCHY_DESCRIPTION =
  DESCRIPTIONS[STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY];

/**
 * Single query schema for LSP call hierarchy
 */
export const LSPCallHierarchyQuerySchema = BaseQuerySchemaLocal.extend({
  uri: z.string().min(1).describe(LSP_CALL_HIERARCHY.scope.uri),

  symbolName: z
    .string()
    .min(1)
    .max(255)
    .describe(LSP_CALL_HIERARCHY.scope.symbolName),

  lineHint: z.number().int().min(1).describe(LSP_CALL_HIERARCHY.scope.lineHint),

  orderHint: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(LSP_CALL_HIERARCHY.options.orderHint),

  direction: z
    .enum(['incoming', 'outgoing'])
    .describe(LSP_CALL_HIERARCHY.options.direction),

  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .default(1)
    .describe(LSP_CALL_HIERARCHY.options.depth),

  contextLines: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(2)
    .describe(LSP_CALL_HIERARCHY.options.contextLines),

  callsPerPage: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .default(15)
    .describe(LSP_CALL_HIERARCHY.pagination.callsPerPage),

  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(LSP_CALL_HIERARCHY.pagination.page),
});

/**
 * Bulk query schema for LSP call hierarchy
 * Lower limit (maxQueries: 3) due to expensive operation
 */
export const BulkLSPCallHierarchySchema = createBulkQuerySchema(
  STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
  LSPCallHierarchyQuerySchema,
  { maxQueries: 3 }
);

export type LSPCallHierarchyQuery = z.infer<typeof LSPCallHierarchyQuerySchema>;
