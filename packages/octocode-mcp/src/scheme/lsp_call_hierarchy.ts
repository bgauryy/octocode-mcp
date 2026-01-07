/**
 * Schema for lspCallHierarchy tool
 */

import { z } from 'zod';
import { BaseQuerySchemaLocal, createBulkQuerySchema } from './baseSchema.js';
import { STATIC_TOOL_NAMES } from '../tools/toolNames.js';

/**
 * Field descriptions for LSP Call Hierarchy
 */
const FIELD_DESCRIPTIONS = {
  uri: 'File path containing the function. Example: "src/api/handler.ts"',
  symbolName: 'EXACT function/method name. No parens',
  lineHint: '1-indexed line number where function is defined or called.',
  orderHint:
    '0-indexed occurrence if name appears multiple times on line. Default: 0',
  direction:
    '"incoming" = find callers (who calls this), "outgoing" = find callees (what this calls)',
  depth:
    'Recursion depth for transitive calls. 1 = direct only, 2 = one level deep. Max 3 recommended. Default: 1',
  contextLines:
    'Lines of context around each call site. Range: 0-10. Default: 2',
  callsPerPage: 'Max call sites per response. Range: 1-30. Default: 15',
  page: 'Page number for pagination. 1-indexed. Default: 1',
};

/**
 * Tool description for lspCallHierarchy
 */
export const LSP_CALL_HIERARCHY_DESCRIPTION = `## Trace function call relationships
> **TL;DR**: Build call graph for functions. "incoming" = who calls this, "outgoing" = what this calls. Expensive at depth>2.

<when>
- "What functions call this?" (incoming) | "What does this call?" (outgoing)
- Understand code flow | Impact analysis for changes
- Build call graph for documentation or debugging
</when>
<when_NOT>
- DON'T use for types/interfaces/variables → use lspFindReferences
- DON'T use for partial symbol matching → use localSearchCode
- DON'T use for finding all usages (not just calls) → use lspFindReferences
</when_NOT>
<prefer_over>
- lspFindReferences: When you specifically need call relationships, not all references
- localSearchCode: When you need semantic call graph, not text matches
</prefer_over>
<prerequisites>
- Symbol must be a function or method (not type/variable)
- Symbol name must be EXACT (case-sensitive)
- lineHint must be accurate (within ±2 lines)
</prerequisites>
<limitations>
- ⚠️ PERFORMANCE: depth>2 is expensive - O(n^depth) complexity
- Cannot trace dynamic calls (callbacks, event handlers, eval)
- Cannot trace through indirect invocation patterns
- Large codebases with depth>1 may timeout
</limitations>
<fromTool>
- self: Chain hierarchy calls (A calls B calls C) with depth parameter
- lspGotoDefinition: Find function definition → lspCallHierarchy for call graph
- lspFindReferences: Alternative for broader usage search (not just calls)
- localGetFileContent: Read caller/callee implementations
- localSearchCode: Find function first → lspCallHierarchy for relationships
</fromTool>
<gotchas>
- direction="incoming": who calls this function (callers)
- direction="outgoing": what this function calls (callees)
- depth controls recursion: 1 = direct only, 2+ = transitive calls
- Expensive operation - limit depth to avoid timeout (max 3 recommended)
- Works best with functions/methods, not variables or types
</gotchas>
<recovery>
- Not a function? → Use lspFindReferences for types/variables
- Timeout? → Reduce depth to 1, paginate with callsPerPage
- Empty result? → Function may be entry point or use dynamic dispatch
</recovery>
<defaults>
- depth: 1 (direct calls only)
- contextLines: 2 (lines around each call site)
- callsPerPage: 15
- page: 1
</defaults>
<bulk_behavior>
- Max queries: 3 (lower than other tools due to expensive operation)
- Queries execute in parallel
- Each query result is independent
</bulk_behavior>
<examples>
- uri="src/api/handler.ts", symbolName="processRequest", lineHint=50, direction="incoming"
- uri="src/services/auth.ts", symbolName="validateToken", lineHint=20, direction="outgoing", depth=2
- uri="src/core/engine.ts", symbolName="execute", lineHint=100, direction="incoming", depth=1, callsPerPage=10
</examples>`;

/**
 * Single query schema for LSP call hierarchy
 */
export const LSPCallHierarchyQuerySchema = BaseQuerySchemaLocal.extend({
  uri: z.string().min(1).describe(FIELD_DESCRIPTIONS.uri),

  symbolName: z
    .string()
    .min(1)
    .max(255)
    .describe(FIELD_DESCRIPTIONS.symbolName),

  lineHint: z.number().int().min(1).describe(FIELD_DESCRIPTIONS.lineHint),

  orderHint: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(FIELD_DESCRIPTIONS.orderHint),

  direction: z
    .enum(['incoming', 'outgoing'])
    .describe(FIELD_DESCRIPTIONS.direction),

  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .default(1)
    .describe(FIELD_DESCRIPTIONS.depth),

  contextLines: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(2)
    .describe(FIELD_DESCRIPTIONS.contextLines),

  callsPerPage: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .default(15)
    .describe(FIELD_DESCRIPTIONS.callsPerPage),

  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(FIELD_DESCRIPTIONS.page),
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
type BulkLSPCallHierarchyRequest = z.infer<typeof BulkLSPCallHierarchySchema>;
