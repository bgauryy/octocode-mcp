import type { Command } from 'commander';
import { executeFindReferences } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerLspReferences(program: Command): void {
  program
    .command('lsp-references')
    .description('Find all references to a symbol using LSP')
    .requiredOption('--uri <path>', 'File path')
    .requiredOption('--symbol <name>', 'Symbol name')
    .requiredOption('--line-hint <n>', 'Line number hint (1-indexed)')
    .option('--order-hint <n>', 'Order hint for same-line symbols', '0')
    .option('--include-declaration', 'Include declaration (default: true)')
    .option('--no-include-declaration', 'Exclude declaration')
    .option('--context-lines <n>', 'Context lines (0-10)', '2')
    .option('--refs-per-page <n>', 'References per page (1-50)', '20')
    .option('--page <n>', 'Page number', '1')
    .option('--include-pattern <patterns>', 'Comma-separated include glob patterns')
    .option('--exclude-pattern <patterns>', 'Comma-separated exclude glob patterns')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await executeFindReferences({
          queries: [withContext({
            uri: opts.uri,
            symbolName: opts.symbol,
            lineHint: parseInt(opts.lineHint, 10),
            orderHint: parseInt(opts.orderHint, 10),
            includeDeclaration: opts.includeDeclaration ?? true,
            contextLines: parseInt(opts.contextLines, 10),
            referencesPerPage: parseInt(opts.refsPerPage, 10),
            page: parseInt(opts.page, 10),
            includePattern: opts.includePattern?.split(',').map((s: string) => s.trim()),
            excludePattern: opts.excludePattern?.split(',').map((s: string) => s.trim()),
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
