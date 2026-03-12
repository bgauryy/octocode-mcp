import type { Command } from 'commander';
import { searchPackages } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerSearchPackages(program: Command): void {
  program
    .command('search-packages')
    .description('Search npm or PyPI packages')
    .requiredOption('--name <name>', 'Package name to search')
    .requiredOption('--ecosystem <type>', 'Ecosystem: npm|python')
    .option('--limit <n>', 'Search result limit (1-10)', '1')
    .option('--fetch-metadata', 'Fetch detailed package metadata')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const limit = parseInt(opts.limit, 10);
        const isNpm = opts.ecosystem === 'npm';
        const result = await searchPackages({
          queries: [withContext({
            name: opts.name,
            ecosystem: opts.ecosystem,
            searchLimit: limit,
            ...(isNpm
              ? { npmFetchMetadata: opts.fetchMetadata ?? false }
              : { pythonFetchMetadata: opts.fetchMetadata ?? false }),
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
