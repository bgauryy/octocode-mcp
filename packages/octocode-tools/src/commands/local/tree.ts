import type { Command } from 'commander';
import { executeViewStructure } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerLocalTree(program: Command): void {
  program
    .command('local-tree')
    .description('View local directory structure')
    .requiredOption('--path <path>', 'Directory path')
    .option('--details', 'Show file details')
    .option('--hidden', 'Show hidden files')
    .option('--sort-by <field>', 'Sort: name|size|time|extension', 'time')
    .option('--reverse', 'Reverse sort order')
    .option('--entries-per-page <n>', 'Entries per page (1-50)', '20')
    .option('--page <n>', 'Page number', '1')
    .option('--pattern <pattern>', 'Glob pattern filter')
    .option('--dirs-only', 'Show directories only')
    .option('--files-only', 'Show files only')
    .option('--extension <ext>', 'Filter by extension')
    .option('--extensions <exts>', 'Comma-separated extensions')
    .option('--depth <n>', 'Directory depth (1-5)')
    .option('--recursive', 'Recursive listing')
    .option('--limit <n>', 'Max entries')
    .option('--summary', 'Show summary (default: true)')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await executeViewStructure({
          queries: [withContext({
            path: opts.path,
            details: opts.details ?? false,
            hidden: opts.hidden ?? false,
            sortBy: opts.sortBy,
            reverse: opts.reverse,
            entriesPerPage: parseInt(opts.entriesPerPage, 10),
            entryPageNumber: parseInt(opts.page, 10),
            pattern: opts.pattern,
            directoriesOnly: opts.dirsOnly,
            filesOnly: opts.filesOnly,
            extension: opts.extension,
            extensions: opts.extensions?.split(',').map((s: string) => s.trim()),
            depth: opts.depth ? parseInt(opts.depth, 10) : undefined,
            recursive: opts.recursive,
            limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
            summary: opts.summary ?? true,
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
