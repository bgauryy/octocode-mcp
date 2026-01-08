/**
 * Schema for lspGotoDefinition tool
 */

import { z } from 'zod';
import { BaseQuerySchemaLocal, createBulkQuerySchema } from './baseSchema.js';
import { STATIC_TOOL_NAMES } from '../tools/toolNames.js';

/**
 * Tool description for lspGotoDefinition
 */
export const LSP_GOTO_DEFINITION_DESCRIPTION = `## Navigate to symbol definition
> **TL;DR**: Jump to where a symbol is defined. Requires EXACT symbol name + line hint. Use after localSearchCode locates symbol.

<when>
- Find where function/class/variable/type is defined
- Trace import to source | Jump to declaration
- After localSearchCode finds symbol → get precise definition
- **ALWAYS use after localSearchCode when tracing code flows**
</when>
<prefer_over>
- localSearchCode: When you need precise definition location, not pattern matches
- grep: When you need type-aware jump-to-definition
</prefer_over>
<when_NOT>
- DON'T use for partial/fuzzy matching → use localSearchCode
- DON'T use for searching comments/strings → use localSearchCode
- DON'T use for regex patterns → use localSearchCode
- DON'T use if you don't know exact line → localSearchCode first
</when_NOT>
<prerequisites>
- File must be in workspace (not node_modules by default)
- TypeScript/JavaScript language server must be available
- Symbol name must be EXACT (case-sensitive, complete name)
- lineHint must be within ±2 lines of actual symbol position
</prerequisites>
<limitations>
- Cannot resolve dynamic symbols (computed property names, eval)
- Cannot trace through runtime polymorphism
- External library definitions require node_modules access
- Large files may timeout - use localSearchCode first to locate
</limitations>
<fromTool>
- self: Chain definitions (A→B→C) for deep tracing
- localSearchCode: Found symbol match → lspGotoDefinition for precise location
- localGetFileContent: Read definition → lspGotoDefinition to trace further
- lspFindReferences: After finding definition → find all usages
- lspCallHierarchy: After definition → trace call graph
</fromTool>
<gotchas>
- lineHint is 1-indexed (line 1 = first line). NEVER use 0.
- symbolName must be EXACT text (not partial). "fetchData" ✓, "fetch" ✗
- orderHint: 0 = first occurrence on line, 1 = second, etc.
- Returns empty if symbol not in ±2 lines of lineHint (adjust hint if needed)
- For overloaded functions: use orderHint to disambiguate
</gotchas>
<recovery>
- Empty result? → localSearchCode(pattern="symbolName") to find correct line
- File not found? → localFindFiles or localViewStructure to locate
- Timeout? → Use localGetFileContent(matchString="symbol") for large files
</recovery>
<defaults>
- contextLines: 5 (lines before + after definition)
- orderHint: 0 (first occurrence on line)
</defaults>
<examples>
- uri="src/utils.ts", symbolName="fetchData", lineHint=42
- uri="src/types/index.ts", symbolName="UserConfig", lineHint=15, orderHint=0
- uri="lib/auth.ts", symbolName="validateToken", lineHint=100, contextLines=10
</examples>`;

/**
 * Field descriptions for LSP goto definition
 */
const FIELD_DESCRIPTIONS = {
  uri: 'File path containing the symbol. Relative paths resolved from workspace root. Example: "src/utils.ts"',
  symbolName: 'EXACT symbol text. No parens, no partial matches',
  lineHint:
    '1-indexed line number where symbol appears (first line = 1, NOT 0). Tool searches ±2 lines if not exact match.',
  orderHint:
    '0-indexed occurrence if symbol appears multiple times on same line. 0 = first, 1 = second. Default: 0',
  contextLines:
    'Lines of code context to include around definition (before + after). Range: 0-20. Default: 5',
};

/**
 * Base schema for LSP goto definition query
 */
const LSPGotoDefinitionBaseSchema = BaseQuerySchemaLocal.extend({
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
    .default(0)
    .describe(FIELD_DESCRIPTIONS.orderHint),

  contextLines: z
    .number()
    .int()
    .min(0)
    .max(20)
    .default(5)
    .describe(FIELD_DESCRIPTIONS.contextLines),
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
type BulkLSPGotoDefinitionRequest = z.infer<typeof BulkLSPGotoDefinitionSchema>;
