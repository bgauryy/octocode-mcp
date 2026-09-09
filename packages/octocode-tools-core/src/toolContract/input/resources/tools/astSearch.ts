import { z } from 'zod';
import { metaFields } from './_toolkit.js';
import { RipgrepQuerySchema } from './localTextOperation.js';
import { FindFilesQuerySchema } from './localFilesOperation.js';
import { ViewStructureQuerySchema } from './localTreeOperation.js';
import { GraphAnalysisQuerySchema } from './topologyOperation.js';

const matchBase = z
  .object(RipgrepQuerySchema.shape)
  .omit({
    searchText: true,
    pattern: true,
    rule: true,
    mode: true,
    output: true,
    regex: true,
    caseMode: true,
    wholeWord: true,
    invertMatch: true,
    multiline: true,
    unique: true,
    matchWindow: true,
    itemsPerPage: true,
    sortReverse: true,
  })
  .extend({
    operation: z.literal('match'),
    langType: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Grammar selector; required for directory searches. A single source file uses its extension.'
      ),
    resultView: z.enum(['content', 'files', 'countMatches']).default('content'),
    pageSize: RipgrepQuerySchema.shape.itemsPerPage,
    reverse: RipgrepQuerySchema.shape.sortReverse,
  })
  .strict();

const files = z
  .object(FindFilesQuerySchema.shape)
  .omit({ regex: true, sortBy: true, itemsPerPage: true })
  .extend({
    operation: z.literal('files'),
    pathRegex: FindFilesQuerySchema.shape.regex,
    sort: FindFilesQuerySchema.shape.sortBy,
    pageSize: FindFilesQuerySchema.shape.itemsPerPage,
  })
  .strict()
  .superRefine((query, ctx) => {
    if (
      query.minDepth !== undefined &&
      query.maxDepth !== undefined &&
      query.minDepth > query.maxDepth
    )
      ctx.addIssue({
        code: 'custom',
        path: ['minDepth'],
        message: 'minDepth must be less than or equal to maxDepth.',
      });
  });

const filesystem = ViewStructureQuerySchema.omit({
  pattern: true,
  recursive: true,
  sortBy: true,
  itemsPerPage: true,
})
  .extend({
    operation: z.literal('tree'),
    treeKind: z.literal('filesystem').default('filesystem'),
    namePattern: ViewStructureQuerySchema.shape.pattern,
    sort: ViewStructureQuerySchema.shape.sortBy,
    pageSize: ViewStructureQuerySchema.shape.itemsPerPage,
  })
  .strict();

const snapshot = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .optional()
  .describe('Copy from next.* unchanged; a changed source requires a restart.');
const syntax = z
  .object({
    ...metaFields,
    operation: z.literal('tree'),
    treeKind: z.literal('syntax'),
    path: z.string().min(1).describe('Absolute path to one source file.'),
    namedOnly: z.boolean().default(true),
    nodeOffset: z.number().int().min(0).default(0),
    nodeLimit: z.number().int().min(1).max(1000).default(100),
    snapshot,
  })
  .strict();

const symbols = z
  .object({
    ...metaFields,
    operation: z.literal('symbols'),
    path: z.string().min(1).describe('Absolute source file or directory path.'),
    name: z
      .string()
      .optional()
      .describe('Case-sensitive declaration-name substring.'),
    kinds: z
      .array(z.string())
      .optional()
      .describe('Native declaration kinds; copied from a previous outline.'),
    excludeDir: z.array(z.string()).optional(),
    maxFiles: z.number().int().min(1).max(50000).default(2000),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(1000).default(100),
    snapshot,
  })
  .strict();

function topology<T extends z.ZodRawShape>(branch: z.ZodObject<T>) {
  const { operation: analysis, ...shape } = branch.shape;
  return z
    .object({ ...shape, operation: z.literal('topology'), analysis })
    .strict();
}
const [deadCode, cycles, dependencies, dependents, path, reachability] =
  GraphAnalysisQuerySchema.options;

export const AstSearchQuerySchema = z.union([
  matchBase
    .extend({
      pattern: z
        .string()
        .min(1)
        .regex(/\S/, 'pattern must contain non-whitespace syntax'),
    })
    .strict(),
  matchBase
    .extend({
      rule: z
        .string()
        .min(1)
        .regex(/\S/, 'rule must contain non-whitespace syntax'),
    })
    .strict(),
  files,
  filesystem,
  syntax,
  symbols,
  topology(deadCode),
  topology(cycles),
  topology(dependencies),
  topology(dependents),
  topology(path),
  topology(reachability),
]);
