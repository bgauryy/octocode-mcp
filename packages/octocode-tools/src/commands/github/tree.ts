import type { Command } from 'commander';
import { exploreMultipleRepositoryStructures } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerTree(program: Command): void {
  program
    .command('tree')
    .description('View repository directory structure')
    .requiredOption('--owner <owner>', 'Repository owner')
    .requiredOption('--repo <repo>', 'Repository name')
    .option('--branch <branch>', 'Branch name')
    .option('--path <path>', 'Directory path', '')
    .option('--depth <n>', 'Directory depth (1-2)', '1')
    .option('--entries-per-page <n>', 'Entries per page (1-200)', '50')
    .option('--page <n>', 'Page number', '1')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await exploreMultipleRepositoryStructures({
          queries: [withContext({
            owner: opts.owner,
            repo: opts.repo,
            branch: opts.branch,
            path: opts.path,
            depth: parseInt(opts.depth, 10),
            entriesPerPage: parseInt(opts.entriesPerPage, 10),
            entryPageNumber: parseInt(opts.page, 10),
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
