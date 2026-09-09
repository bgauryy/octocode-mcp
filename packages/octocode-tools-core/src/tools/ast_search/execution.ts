import type { CallToolResult } from '@modelcontextprotocol/server';
import { stat } from 'node:fs/promises';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { executeBulkOperation } from '../../utils/response/bulk/response.js';
import { validateToolPath } from '../../utils/file/toolHelpers.js';
import { executeWithToolBoundary } from '../executionGuard.js';
import { AST_SEARCH_TOOL_NAME } from '../toolNames.js';
import { createGraphAnalysisRunner } from './topology/execution.js';
import { GraphAnalysisQuerySchema } from './topology/scheme.js';
import { findFiles } from '../local_find_files/findFiles.js';
import { FindFilesQuerySchema } from '../../toolContract/input/resources/tools/localFilesOperation.js';
import { viewStructure } from '../local_view_structure/local_view_structure.js';
import { ViewStructureQuerySchema } from '../../toolContract/input/resources/tools/localTreeOperation.js';
import { searchContentStructural } from '../local_ripgrep/structuralSearch.js';
import { LocalRipgrepQuerySchema } from '../local_ripgrep/scheme.js';
import { AstSearchQuerySchema, type AstSearchQuery } from './scheme.js';
import { normalizeAstContinuations } from './continuations.js';
import { inspectSyntax, inspectSymbols } from './inspect.js';

export async function executeAstSearch(
  args: ToolExecutionArgs<AstSearchQuery>
): Promise<CallToolResult> {
  const analyze = createGraphAnalysisRunner();
  return executeBulkOperation(
    args.queries || [],
    query =>
      executeWithToolBoundary({
        toolName: AST_SEARCH_TOOL_NAME,
        query,
        contextMessage: 'astSearch execution failed',
        execute: async () => {
          const validationResult = AstSearchQuerySchema.safeParse(query);
          if (!validationResult.success)
            return {
              status: 'error' as const,
              errorCode:
                query.operation === 'match'
                  ? 'structural.query.invalid'
                  : 'ast.query.invalid',
              error: validationResult.error.message,
            };
          const parsed = validationResult.data;
          if (parsed.operation === 'topology') {
            const { operation: _operation, analysis, ...scope } = parsed;
            const result = await analyze(
              GraphAnalysisQuerySchema.parse({ ...scope, operation: analysis })
            );
            return normalizeAstContinuations({
              ...result,
              operation: 'topology',
              analysis,
            });
          }
          const validation = validateToolPath(parsed, AST_SEARCH_TOOL_NAME);
          if (!validation.isValid) return validation.errorResult;
          const input = { ...parsed, path: validation.sanitizedPath };
          switch (input.operation) {
            case 'match': {
              const {
                operation: _operation,
                resultView,
                pageSize,
                reverse,
                ...scope
              } = input;
              if (!scope.langType && !(await stat(scope.path)).isFile()) {
                return {
                  status: 'error' as const,
                  errorCode: 'ast.language.required',
                  error:
                    'Directory matching requires langType; choose the grammar from the source files.',
                };
              }
              return normalizeAstContinuations(
                await searchContentStructural(
                  LocalRipgrepQuerySchema.parse({
                    ...scope,
                    mode: 'structural',
                    output: resultView,
                    itemsPerPage: pageSize,
                    sortReverse: reverse,
                  })
                )
              );
            }
            case 'files': {
              const {
                operation: _operation,
                pathRegex,
                sort,
                pageSize,
                ...scope
              } = input;
              return normalizeAstContinuations(
                await findFiles(
                  FindFilesQuerySchema.parse({
                    ...scope,
                    regex: pathRegex,
                    sortBy: sort,
                    itemsPerPage: pageSize,
                  })
                )
              );
            }
            case 'tree': {
              if (input.treeKind === 'syntax') return inspectSyntax(input);
              const {
                operation: _operation,
                treeKind: _treeKind,
                namePattern,
                sort,
                pageSize,
                ...scope
              } = input;
              return normalizeAstContinuations(
                await viewStructure(
                  ViewStructureQuerySchema.parse({
                    ...scope,
                    pattern: namePattern,
                    sortBy: sort,
                    itemsPerPage: pageSize,
                  })
                )
              );
            }
            case 'symbols':
              return inspectSymbols(input);
          }
        },
      }),
    { toolName: AST_SEARCH_TOOL_NAME },
    args
  );
}
