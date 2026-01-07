/**
 * Schema for lspFindReferences tool
 */

import { z } from 'zod';
import { BaseQuerySchemaLocal, createBulkQuerySchema } from './baseSchema.js';
import { STATIC_TOOL_NAMES } from '../tools/toolNames.js';

/**
 * Field descriptions for lspFindReferences schema
 */
const FIELD_DESCRIPTIONS = {
  uri: 'File path containing the symbol. Example: "src/api/client.ts"',
  symbolName:
    'EXACT text of the symbol to find references for. Must match precisely.',
  lineHint:
    '1-indexed line number where symbol appears (first line = 1). Tool searches +/-2 lines.',
  orderHint:
    '0-indexed occurrence if symbol appears multiple times on same line. Default: 0',
  includeDeclaration:
    'Include the symbol definition in results. true = include, false = usages only. Default: true',
  contextLines:
    'Lines of context around each reference. Range: 0-10. Default: 2',
  referencesPerPage:
    'Max references per response for pagination. Range: 1-50. Default: 20',
  page: 'Page number for paginated results. 1-indexed. Default: 1',
} as const;

/**
 * Tool description for lspFindReferences
 */
export const LSP_FIND_REFERENCES_DESCRIPTION = `## Find all references to a symbol
<when>
- Find all usages of function/class/variable/type across workspace
- Impact analysis before refactoring | "Who calls this?"
- After lspGotoDefinition -> find where symbol is used
</when>
<when_NOT>
- DON'T use for partial/fuzzy matching → use localSearchCode
- DON'T use for searching comments/strings → use localSearchCode
- DON'T use for regex patterns → use localSearchCode
- DON'T use for call relationships specifically → use lspCallHierarchy
</when_NOT>
<prefer_over>
- localSearchCode: When you need semantic accuracy (ignores comments, strings)
- grep: When you need cross-file symbol tracking with type awareness
</prefer_over>
<prerequisites>
- File must be in workspace
- Symbol name must be EXACT (case-sensitive)
- lineHint must be accurate (within ±2 lines)
</prerequisites>
<limitations>
- Cannot find dynamic references (computed property access, eval)
- Cannot track through string concatenation or template literals
- Large result sets may need pagination (100+ references common)
</limitations>
<fromTool>
- self: Paginate through large result sets (page parameter)
- lspGotoDefinition: Find definition first -> lspFindReferences for usages
- localGetFileContent: Read each reference location for context
- localSearchCode: Pre-filter with pattern search -> refine with lspFindReferences
- lspCallHierarchy: For function call relationships specifically
</fromTool>
<gotchas>
- includeDeclaration=true (default) includes the definition itself in results
- Large codebases may return 100+ references - use pagination (referencesPerPage, page)
- More precise than grep: ignores comments, strings, similar names
- Slower than localSearchCode but semantically accurate
- Empty result? Verify symbolName is exact and lineHint is correct
</gotchas>
<recovery>
- Empty result? → Verify symbolName is EXACT, check lineHint accuracy
- Symbol may be unused → Consider dead code removal
- Dynamic references? → Use localSearchCode as fallback
</recovery>
<defaults>
- includeDeclaration: true (includes definition in results)
- contextLines: 2 (lines around each reference)
- referencesPerPage: 20
- page: 1
</defaults>
<examples>
- uri="src/api/client.ts", symbolName="fetchUser", lineHint=45, includeDeclaration=false
- uri="src/types.ts", symbolName="UserConfig", lineHint=10, referencesPerPage=20, page=1
- uri="src/utils/logger.ts", symbolName="log", lineHint=5, contextLines=3
</examples>`;

/**
 * Base schema for LSP find references query
 */
const LSPFindReferencesBaseSchema = BaseQuerySchemaLocal.extend({
  uri: z.string().min(1).describe(FIELD_DESCRIPTIONS.uri),

  symbolName: z.string().min(1).describe(FIELD_DESCRIPTIONS.symbolName),

  lineHint: z.number().int().min(1).describe(FIELD_DESCRIPTIONS.lineHint),

  orderHint: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(FIELD_DESCRIPTIONS.orderHint),

  includeDeclaration: z
    .boolean()
    .optional()
    .default(true)
    .describe(FIELD_DESCRIPTIONS.includeDeclaration),

  contextLines: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(2)
    .describe(FIELD_DESCRIPTIONS.contextLines),

  referencesPerPage: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe(FIELD_DESCRIPTIONS.referencesPerPage),

  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(FIELD_DESCRIPTIONS.page),
});

/**
 * Single query schema for LSP find references
 */
export const LSPFindReferencesQuerySchema = LSPFindReferencesBaseSchema;

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
type BulkLSPFindReferencesRequest = z.infer<typeof BulkLSPFindReferencesSchema>;
