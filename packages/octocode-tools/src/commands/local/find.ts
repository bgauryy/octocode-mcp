import type { Command } from 'commander';
import { executeFindFiles } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerLocalFind(program: Command): void {
  program
    .command('local-find')
    .description('Find local files by name, type, or metadata')
    .requiredOption('--path <path>', 'Directory path to search')
    .option('--name <pattern>', 'Filename pattern (exact or glob)')
    .option('--iname <pattern>', 'Case-insensitive filename pattern')
    .option('--names <patterns>', 'Comma-separated filename patterns')
    .option('--regex <pattern>', 'Regex pattern for filename')
    .option('--type <type>', 'File type: f|d|l (file|dir|link)')
    .option('--empty', 'Find empty files/dirs')
    .option('--max-depth <n>', 'Max directory depth (1-10)')
    .option('--min-depth <n>', 'Min directory depth (0-10)')
    .option('--modified-within <time>', 'Modified within (e.g., 1h, 7d)')
    .option('--modified-before <time>', 'Modified before')
    .option('--size-greater <size>', 'Larger than (e.g., 1k, 1M)')
    .option('--size-less <size>', 'Smaller than')
    .option('--exclude-dir <dirs>', 'Comma-separated directories to exclude')
    .option('--sort-by <field>', 'Sort: modified|size|name|path', 'modified')
    .option('--limit <n>', 'Max results')
    .option('--details', 'Show file details (default: true)')
    .option('--files-per-page <n>', 'Files per page (1-50)', '20')
    .option('--file-page <n>', 'Page number', '1')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await executeFindFiles({
          queries: [withContext({
            path: opts.path,
            name: opts.name,
            iname: opts.iname,
            names: opts.names?.split(',').map((s: string) => s.trim()),
            regex: opts.regex,
            type: opts.type,
            empty: opts.empty,
            maxDepth: opts.maxDepth ? parseInt(opts.maxDepth, 10) : undefined,
            minDepth: opts.minDepth ? parseInt(opts.minDepth, 10) : undefined,
            modifiedWithin: opts.modifiedWithin,
            modifiedBefore: opts.modifiedBefore,
            sizeGreater: opts.sizeGreater,
            sizeLess: opts.sizeLess,
            excludeDir: opts.excludeDir?.split(',').map((s: string) => s.trim()),
            sortBy: opts.sortBy,
            limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
            details: opts.details ?? true,
            filesPerPage: parseInt(opts.filesPerPage, 10),
            filePageNumber: parseInt(opts.filePage, 10),
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
