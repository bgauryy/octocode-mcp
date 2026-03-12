import type { Command } from 'commander';
import { executeRipgrepSearch } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerLocalSearch(program: Command): void {
  program
    .command('local-search')
    .description('Search local code with ripgrep')
    .requiredOption('--pattern <pattern>', 'Search pattern (regex)')
    .requiredOption('--path <path>', 'Directory or file path')
    .option('--mode <mode>', 'Mode: discovery|paginated|detailed')
    .option('--fixed-string', 'Treat pattern as literal string')
    .option('--smart-case', 'Smart case matching (default: true)')
    .option('--case-insensitive', 'Case insensitive search')
    .option('--case-sensitive', 'Case sensitive search')
    .option('--whole-word', 'Match whole words only')
    .option('--invert-match', 'Invert match')
    .option('--type <type>', 'File type filter (e.g., ts, py)')
    .option('--include <patterns>', 'Comma-separated include globs')
    .option('--exclude <patterns>', 'Comma-separated exclude globs')
    .option('--exclude-dir <dirs>', 'Comma-separated directories to exclude')
    .option('--no-ignore', 'Don\'t respect .gitignore')
    .option('--hidden', 'Search hidden files')
    .option('--files-only', 'Return file paths only')
    .option('--count', 'Return match counts only')
    .option('--context-lines <n>', 'Context lines around matches (0-50)')
    .option('--max-files <n>', 'Maximum files to search (1-1000)')
    .option('--files-per-page <n>', 'Files per page (1-50)', '10')
    .option('--file-page <n>', 'File page number', '1')
    .option('--multiline', 'Enable multiline matching')
    .option('--sort <field>', 'Sort: path|modified|accessed|created', 'path')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await executeRipgrepSearch({
          queries: [withContext({
            pattern: opts.pattern,
            path: opts.path,
            mode: opts.mode,
            fixedString: opts.fixedString,
            smartCase: opts.smartCase,
            caseInsensitive: opts.caseInsensitive,
            caseSensitive: opts.caseSensitive,
            wholeWord: opts.wholeWord,
            invertMatch: opts.invertMatch,
            type: opts.type,
            include: opts.include?.split(',').map((s: string) => s.trim()),
            exclude: opts.exclude?.split(',').map((s: string) => s.trim()),
            excludeDir: opts.excludeDir?.split(',').map((s: string) => s.trim()),
            noIgnore: opts.noIgnore,
            hidden: opts.hidden,
            filesOnly: opts.filesOnly,
            count: opts.count,
            contextLines: opts.contextLines ? parseInt(opts.contextLines, 10) : undefined,
            maxFiles: opts.maxFiles ? parseInt(opts.maxFiles, 10) : undefined,
            filesPerPage: parseInt(opts.filesPerPage, 10),
            filePageNumber: parseInt(opts.filePage, 10),
            multiline: opts.multiline,
            sort: opts.sort,
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
