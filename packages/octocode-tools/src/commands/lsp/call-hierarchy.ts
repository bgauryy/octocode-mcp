import type { Command } from 'commander';
import { executeCallHierarchy } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerLspCallHierarchy(program: Command): void {
  program
    .command('lsp-call-hierarchy')
    .description('Trace call relationships (incoming/outgoing)')
    .requiredOption('--uri <path>', 'File path')
    .requiredOption('--symbol <name>', 'Symbol name')
    .requiredOption('--line-hint <n>', 'Line number hint (1-indexed)')
    .requiredOption('--direction <dir>', 'Direction: incoming|outgoing')
    .option('--order-hint <n>', 'Order hint for same-line symbols', '0')
    .option('--depth <n>', 'Call depth (1-3)', '1')
    .option('--context-lines <n>', 'Context lines (0-10)', '2')
    .option('--calls-per-page <n>', 'Calls per page (1-30)', '15')
    .option('--page <n>', 'Page number', '1')
    .option('--char-offset <n>', 'Character offset for pagination')
    .option('--char-length <n>', 'Character length for pagination')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await executeCallHierarchy({
          queries: [withContext({
            uri: opts.uri,
            symbolName: opts.symbol,
            lineHint: parseInt(opts.lineHint, 10),
            direction: opts.direction,
            orderHint: parseInt(opts.orderHint, 10),
            depth: parseInt(opts.depth, 10),
            contextLines: parseInt(opts.contextLines, 10),
            callsPerPage: parseInt(opts.callsPerPage, 10),
            page: parseInt(opts.page, 10),
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
