import type { Command } from 'commander';
import { searchMultipleGitHubRepos } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerSearchRepos(program: Command): void {
  program
    .command('search-repos')
    .description('Search GitHub repositories')
    .option('--keywords <words>', 'Comma-separated keywords')
    .option('--topics <topics>', 'Comma-separated topics')
    .option('--owner <owner>', 'Repository owner')
    .option('--stars <range>', 'Stars filter (e.g., >100, 50..200)')
    .option('--size <range>', 'Size filter in KB')
    .option('--created <range>', 'Created date filter')
    .option('--updated <range>', 'Updated date filter')
    .option('--match <fields>', 'Match in: name,description,readme')
    .option('--sort <field>', 'Sort by: forks|stars|updated|best-match')
    .option('--limit <n>', 'Results per page (1-100)', '10')
    .option('--page <n>', 'Page number (1-10)', '1')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await searchMultipleGitHubRepos({
          queries: [withContext({
            keywordsToSearch: opts.keywords?.split(',').map((k: string) => k.trim()),
            topicsToSearch: opts.topics?.split(',').map((t: string) => t.trim()),
            owner: opts.owner,
            stars: opts.stars,
            size: opts.size,
            created: opts.created,
            updated: opts.updated,
            match: opts.match?.split(',').map((m: string) => m.trim()),
            sort: opts.sort,
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
