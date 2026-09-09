import { z } from 'zod';

import type { ToolSpec } from '../../types/index.js';
import {
  buildObject,
  contextLines,
  defineTool,
  intRange,
  MAX_LINE_NUMBER,
  MAX_LSP_DEPTH,
  MAX_LSP_ITEMS_PER_PAGE,
  MAX_ORDER_HINT,
  metaFields,
  pageNumber,
} from './_toolkit.js';

export const lspSearch: ToolSpec = defineTool({
  name: 'lspSearch',
  type: 'Local',
  shortDescription:
    'Run LSP semantic queries — definitions, references, call hierarchy, symbols, type hierarchy, diagnostics.',
  instructions: `Use a real search/read line anchor for semantic proof. references finds usages; callers incoming calls; callees outgoing calls; callHierarchy both. Fall back to references if call hierarchy is unavailable.
documentSymbols/diagnostic need uri. workspaceSymbol needs symbolName and either uri or workspaceRoot. Other operations need uri and either symbolName+lineHint or a zero-based UTF-16 position. orderHint resolves same-line names. format:"compact" saves tokens. Empty/unavailable results call for a new anchor or text search.`,
  schema: {
    pageSize: 'References or symbols returned per page.',
    page: 'Reference/symbol result page.',
    snapshot:
      'Result-set token from next.nextPage; required after page 1. On paginationChanged, discard prior pages and execute next.restartPagination.',
    operation:
      'Identity, usage, hierarchy, hover, symbol, or diagnostic operation.',
    uri: 'Target file path/URI; required for every operation except workspaceSymbol.',
    symbolName: 'Bare anchored identifier, or fuzzy workspace symbol query.',
    lineHint: 'Observed 1-based line containing symbolName.',
    position:
      'Exact 0-based UTF-16 position; use this instead of symbolName+lineHint.',
    orderHint: 'Disambiguate repeated symbols on one line.',
    depth: 'Call/type hierarchy depth; 0 is direct only.',
    includeDeclaration:
      'references: include the declaration; disable before unused analysis.',
    groupByFile: 'references summary mode.',
    contextLines:
      'Lines of surrounding source shown around each result location.',
    format: '"compact" saves tokens; "structured" has typed locations.',
    workspaceRoot: 'Use when auto-root is wrong.',
    rustContext:
      'Explicit Rust build context (requires a .rs uri). Features/target/cfgs select rust-analyzer semantics. buildScripts and procMacros default false; enabling either permits workspace code execution. procMacros requires buildScripts:true. Context partitions server reuse and pagination; syntax graphs remain unexpanded.',
  },
});

/**
 * Common object used by the execution schema.  The public schema below is a
 * union so generated JSON Schema retains the anchor requirements (Zod
 * refinements are intentionally not represented by JSON Schema).
 */
export const LspSearchQueryObjectSchema = buildObject(lspSearch.schema, {
  ...metaFields,
  uri: z.string().optional(),
  operation: z
    .enum([
      'definition',
      'references',
      'callers',
      'callees',
      'callHierarchy',
      'hover',
      'documentSymbols',
      'typeDefinition',
      'implementation',
      'workspaceSymbol',
      'supertypes',
      'subtypes',
      'diagnostic',
    ])
    .default('definition'),
  symbolName: z.string().min(1).optional(),
  lineHint: intRange(1, MAX_LINE_NUMBER).optional(),
  position: z
    .object({
      line: intRange(0, MAX_LINE_NUMBER),
      character: intRange(0, 1_000_000),
    })
    .strict()
    .optional(),
  orderHint: intRange(0, MAX_ORDER_HINT).default(0),
  depth: intRange(0, MAX_LSP_DEPTH).optional(),
  includeDeclaration: z.boolean().default(true),
  groupByFile: z.boolean().optional(),
  page: pageNumber(),
  pageSize: intRange(1, MAX_LSP_ITEMS_PER_PAGE).optional(),
  snapshot: z.string().min(1).max(128).optional(),
  contextLines: contextLines(),
  format: z.enum(['structured', 'compact']).default('structured'),
  workspaceRoot: z.string().optional(),
  rustContext: z
    .object({
      features: z
        .union([z.literal('all'), z.array(z.string().min(1).max(128)).max(128)])
        .default([]),
      noDefaultFeatures: z.boolean().default(false),
      target: z.string().min(1).max(256).optional(),
      cfgs: z.array(z.string().min(1).max(256)).max(128).default([]),
      buildScripts: z.boolean().default(false),
      procMacros: z.boolean().default(false),
    })
    .strict()
    .superRefine((context, ctx) => {
      if (context.procMacros && !context.buildScripts)
        ctx.addIssue({
          code: 'custom',
          path: ['procMacros'],
          message:
            'procMacros requires buildScripts:true because rust-analyzer builds procedural macros through Cargo.',
        });
    })
    .optional(),
}).superRefine((query, ctx) => {
  if (query.rustContext && !query.uri?.toLowerCase().endsWith('.rs')) {
    ctx.addIssue({
      code: 'custom',
      path: ['rustContext'],
      message:
        'rustContext requires a Rust .rs uri, including for workspaceSymbol.',
    });
  }
  // workspaceSymbol: needs a query string (symbolName) but not a position.
  if (query.operation === 'workspaceSymbol') {
    if (!query.symbolName) {
      ctx.addIssue({
        code: 'custom',
        path: ['symbolName'],
        message: 'Set symbolName for workspaceSymbol.',
      });
    }
    if (!query.uri && !query.workspaceRoot) {
      ctx.addIssue({
        code: 'custom',
        path: ['workspaceRoot'],
        message: 'Set uri or workspaceRoot for workspaceSymbol.',
      });
    }
    return;
  }

  // File-scoped types need a URI. documentSymbols/diagnostic do not need a
  // symbol position, but still need a file to inspect.
  if (!query.uri) {
    ctx.addIssue({
      code: 'custom',
      path: ['uri'],
      message: 'Set uri for file-scoped operations.',
    });
  }
  if (query.operation === 'documentSymbols' || query.operation === 'diagnostic')
    return;

  // Anchored operations accept exactly one anchor form.
  const hasNameAnchor =
    Boolean(query.symbolName) || query.lineHint !== undefined;
  const hasPositionAnchor = query.position !== undefined;
  if (hasNameAnchor && hasPositionAnchor) {
    ctx.addIssue({
      code: 'custom',
      path: ['position'],
      message: 'Use either symbolName+lineHint or position, not both.',
    });
    return;
  }
  if (hasPositionAnchor) return;
  if (!query.symbolName) {
    ctx.addIssue({
      code: 'custom',
      path: ['symbolName'],
      message: 'Set symbolName for anchored operations.',
    });
  }
  if (!Number.isInteger(query.lineHint)) {
    ctx.addIssue({
      code: 'custom',
      path: ['lineHint'],
      message: 'Set lineHint for anchored operations.',
    });
  }
});

const extendableLspSchema =
  LspSearchQueryObjectSchema as z.ZodObject<z.ZodRawShape> & {
    safeExtend: (shape: z.ZodRawShape) => z.ZodObject<z.ZodRawShape>;
  };
const anchoredOperations = z.enum([
  'definition',
  'references',
  'callers',
  'callees',
  'callHierarchy',
  'hover',
  'typeDefinition',
  'implementation',
  'supertypes',
  'subtypes',
]);
const namedAnchorSchema = extendableLspSchema.safeExtend({
  uri: z.string().min(1),
  operation: anchoredOperations.default('definition'),
  symbolName: z.string().min(1),
  lineHint: intRange(1, MAX_LINE_NUMBER),
  position: z.never().optional(),
});
const positionAnchorSchema = extendableLspSchema.safeExtend({
  uri: z.string().min(1),
  operation: anchoredOperations.default('definition'),
  position: z
    .object({
      line: intRange(0, MAX_LINE_NUMBER),
      character: intRange(0, 1_000_000),
    })
    .strict(),
  symbolName: z.never().optional(),
  lineHint: z.never().optional(),
});
const documentSchema = extendableLspSchema.safeExtend({
  uri: z.string().min(1),
  operation: z.enum(['documentSymbols', 'diagnostic']),
  symbolName: z.never().optional(),
  lineHint: z.never().optional(),
  position: z.never().optional(),
});
const workspaceSchema = z.union([
  extendableLspSchema.safeExtend({
    operation: z.literal('workspaceSymbol'),
    uri: z.string().min(1),
    symbolName: z.string().min(1),
  }),
  extendableLspSchema.safeExtend({
    operation: z.literal('workspaceSymbol'),
    symbolName: z.string().min(1),
    workspaceRoot: z.string().min(1),
  }),
]);

export const LspSearchQuerySchema = z.union(
  [namedAnchorSchema, positionAnchorSchema, documentSchema, workspaceSchema],
  { error: lspSearch.instructions }
);
