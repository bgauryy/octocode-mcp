import type { Command } from 'commander';
import { searchMultipleGitHubCode } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerSearchCode(program: Command): void {
  program
    .command('search-code')
    .description('Search code across GitHub repositories')
    .requiredOption('--keywords <words>', 'Comma-separated keywords (max 5)')
    .option('--owner <owner>', 'Repository owner')
    .option('--repo <repo>', 'Repository name')
    .option('--extension <ext>', 'File extension filter (e.g., ts, py)')
    .option('--filename <name>', 'Filename filter')
    .option('--path <path>', 'Path filter')
    .option('--match <type>', 'Match type: file|path', 'file')
    .option('--limit <n>', 'Results per page (1-100)', '10')
    .option('--page <n>', 'Page number (1-10)', '1')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await searchMultipleGitHubCode({
          queries: [withContext({
            keywordsToSearch: opts.keywords.split(',').map((k: string) => k.trim()),
            owner: opts.owner,
            repo: opts.repo,
            extension: opts.extension,
            filename: opts.filename,
            path: opts.path,
            match: opts.match,
            limit: parseInt(opts.limit, 10),
            page: parseInt(opts.page, 10),
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
