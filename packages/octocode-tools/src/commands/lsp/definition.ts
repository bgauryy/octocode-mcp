import type { Command } from 'commander';
import { executeGotoDefinition } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerLspDefinition(program: Command): void {
  program
    .command('lsp-definition')
    .description('Go to symbol definition using LSP')
    .requiredOption('--uri <path>', 'File path')
    .requiredOption('--symbol <name>', 'Symbol name')
    .requiredOption('--line-hint <n>', 'Line number hint (1-indexed)')
    .option('--order-hint <n>', 'Order hint for same-line symbols', '0')
    .option('--context-lines <n>', 'Context lines (0-20)', '5')
    .option('--char-offset <n>', 'Character offset for pagination')
    .option('--char-length <n>', 'Character length for pagination')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await executeGotoDefinition({
          queries: [withContext({
            uri: opts.uri,
            symbolName: opts.symbol,
            lineHint: parseInt(opts.lineHint, 10),
            orderHint: parseInt(opts.orderHint, 10),
            contextLines: parseInt(opts.contextLines, 10),
            charOffset: opts.charOffset ? parseInt(opts.charOffset, 10) : undefined,
            charLength: opts.charLength ? parseInt(opts.charLength, 10) : undefined,
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
