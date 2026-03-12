import type { Command } from 'commander';
import { fetchMultipleGitHubFileContents } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerGetFile(program: Command): void {
  program
    .command('get-file')
    .description('Get file content from a GitHub repository')
    .requiredOption('--owner <owner>', 'Repository owner')
    .requiredOption('--repo <repo>', 'Repository name')
    .requiredOption('--path <path>', 'File path')
    .option('--branch <branch>', 'Branch name')
    .option('--type <type>', 'Content type: file|directory', 'file')
    .option('--full-content', 'Get full file content')
    .option('--start-line <n>', 'Start line number')
    .option('--end-line <n>', 'End line number')
    .option('--match <string>', 'Extract lines matching this string')
    .option('--context-lines <n>', 'Context lines around match (1-50)', '5')
    .option('--char-offset <n>', 'Character offset for pagination')
    .option('--char-length <n>', 'Character length for pagination')
    .option('--force-refresh', 'Force refresh cached content')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await fetchMultipleGitHubFileContents({
          queries: [withContext({
            owner: opts.owner,
            repo: opts.repo,
            path: opts.path,
            branch: opts.branch,
            type: opts.type,
            fullContent: opts.fullContent ?? false,
            startLine: opts.startLine ? parseInt(opts.startLine, 10) : undefined,
            endLine: opts.endLine ? parseInt(opts.endLine, 10) : undefined,
            matchString: opts.match,
            matchStringContextLines: parseInt(opts.contextLines, 10),
            charOffset: opts.charOffset ? parseInt(opts.charOffset, 10) : undefined,
            charLength: opts.charLength ? parseInt(opts.charLength, 10) : undefined,
            forceRefresh: opts.forceRefresh ?? false,
          })],
        });
        outputResult(result, opts.pretty);
      } catch (error) {
        outputError(error);
      }
    });
}
