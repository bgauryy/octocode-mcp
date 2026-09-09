import { z } from 'zod';

import type { ToolSpec } from '../../types/index.js';
import { defineTool } from './_toolkit.js';
import {
  localTextOperationDescriptions,
  RipgrepQuerySchema,
} from './localTextOperation.js';

const searchSchemaDescriptions: Record<string, string> = {
  ...localTextOperationDescriptions,
};
delete searchSchemaDescriptions.mode;
delete searchSchemaDescriptions.pattern;
delete searchSchemaDescriptions.rule;
delete searchSchemaDescriptions.itemsPerPage;
delete searchSchemaDescriptions.sortReverse;

const textResultViewSchema = z.enum([
  'paginated',
  'discovery',
  'detailed',
  'content',
  'files',
  'filesWithout',
  'countLines',
  'countMatches',
  'matchOnly',
]);

const lexicalRegexSchema = z
  .enum(['literal', 'rust', 'pcre2'])
  .optional()
  .default('rust')
  .describe('Matching engine: literal, rust, or pcre2.');

const textQuerySchema = z
  .object(RipgrepQuerySchema.shape)
  .omit({
    mode: true,
    pattern: true,
    rule: true,
    captureText: true,
    output: true,
    itemsPerPage: true,
    sortReverse: true,
    regex: true,
  })
  .extend({
    searchText: z.string().describe('Single lexical pattern.'),
    regex: lexicalRegexSchema,
    resultView: textResultViewSchema.optional().default('paginated'),
    pageSize: RipgrepQuerySchema.shape.itemsPerPage,
    reverse: RipgrepQuerySchema.shape.sortReverse,
    matchWindow: RipgrepQuerySchema.shape.matchWindow,
  })
  .strict();

export const LocalSearchQuerySchema = textQuerySchema.superRefine(
  (query, ctx) => {
    const executionInput: Record<string, unknown> = {
      ...query,
      itemsPerPage: query.pageSize,
      sortReverse: query.reverse,
      mode: ['paginated', 'discovery', 'detailed'].includes(query.resultView)
        ? query.resultView
        : 'paginated',
      output: ['paginated', 'discovery', 'detailed'].includes(query.resultView)
        ? 'content'
        : query.resultView,
      regex:
        query.regex === 'literal'
          ? 'fixed'
          : query.regex === 'pcre2'
            ? 'perl'
            : 'smart',
    };
    delete executionInput.resultView;
    delete executionInput.pageSize;
    delete executionInput.reverse;
    const result = RipgrepQuerySchema.safeParse(executionInput);
    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.code === 'custom') {
          ctx.addIssue({
            code: 'custom',
            message: issue.message,
            path: issue.path,
          });
        }
      }
    }
  }
);

export const localSearch: ToolSpec = defineTool({
  name: 'localSearch',
  type: 'Local',
  shortDescription:
    'Search local text with literal, Rust regex, or PCRE2 matching.',
  instructions:
    'Search local text with searchText. Choose regex:"literal" for exact text, regex:"rust" for native Rust regex, or regex:"pcre2" for PCRE2 syntax. Use resultView for paginated snippets, discovery paths, detailed context, content, files, filesWithout, countLines, countMatches, or matchOnly output. Use localGetFileContent for exact file reads and lspSearch for symbol identity.',
  schema: {
    ...searchSchemaDescriptions,
    regex: 'Matching engine: "literal", "rust", or "pcre2".',
    resultView:
      'Lexical result shape: paginated, discovery, detailed, content, files, filesWithout, countLines, countMatches, or matchOnly.',
    pageSize:
      'Files returned per page; matchPage pages matches within each file.',
    reverse: 'Reverse the selected sort order.',
  },
});
