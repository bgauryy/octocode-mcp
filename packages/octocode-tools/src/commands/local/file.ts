import type { Command } from 'commander';
import { executeFetchContent } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerLocalFile(program: Command): void {
  program
    .command('local-file')
    .description('Read local file content')
    .requiredOption('--path <path>', 'File path')
    .option('--full-content', 'Get full file content')
    .option('--start-line <n>', 'Start line number')
    .option('--end-line <n>', 'End line number')
    .option('--match <string>', 'Extract lines matching this string')
    .option('--context-lines <n>', 'Context lines around match (1-50)', '5')
    .option('--match-regex', 'Treat match string as regex')
    .option('--match-case-sensitive', 'Case-sensitive match')
    .option('--char-offset <n>', 'Character offset for pagination')
    .option('--char-length <n>', 'Character length for pagination')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await executeFetchContent({
          queries: [withContext({
            path: opts.path,
            fullContent: opts.fullContent ?? false,
            startLine: opts.startLine ? parseInt(opts.startLine, 10) : undefined,
            endLine: opts.endLine ? parseInt(opts.endLine, 10) : undefined,
            matchString: opts.match,
            matchStringContextLines: parseInt(opts.contextLines, 10),
            matchStringIsRegex: opts.matchRegex ?? false,
            matchStringCaseSensitive: opts.matchCaseSensitive ?? false,
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
