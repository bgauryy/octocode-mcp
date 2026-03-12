import type { Command } from 'commander';
import { searchMultipleGitHubPullRequests } from 'octocode-mcp/public';
import { outputResult, outputError } from '../../output.js';
import { ensureInitialized } from '../../init.js';
import { withContext } from '../../query.js';

export function registerSearchPrs(program: Command): void {
  program
    .command('search-prs')
    .description('Search pull requests on GitHub')
    .option('--query <text>', 'Search query (max 256 chars)')
    .option('--owner <owner>', 'Repository owner')
    .option('--repo <repo>', 'Repository name')
    .option('--pr-number <n>', 'Specific PR number')
    .option('--state <state>', 'State: open|closed')
    .option('--author <user>', 'PR author')
    .option('--assignee <user>', 'PR assignee')
    .option('--label <labels>', 'Comma-separated labels')
    .option('--head <branch>', 'Head branch')
    .option('--base <branch>', 'Base branch')
    .option('--merged', 'Only merged PRs')
    .option('--draft', 'Only draft PRs')
    .option('--created <range>', 'Created date filter')
    .option('--updated <range>', 'Updated date filter')
    .option('--sort <field>', 'Sort by: created|updated|best-match')
    .option('--order <dir>', 'Order: asc|desc', 'desc')
    .option('--limit <n>', 'Results per page (1-10)', '5')
    .option('--page <n>', 'Page number (1-10)', '1')
    .option('--with-comments', 'Include PR comments')
    .option('--with-commits', 'Include PR commits')
    .option('--content-type <type>', 'Content: metadata|fullContent|partialContent', 'metadata')
    .option('--char-offset <n>', 'Character offset for pagination')
    .option('--char-length <n>', 'Character length for pagination')
    .option('--pretty', 'Human-readable output')
    .action(async (opts) => {
      try {
        await ensureInitialized();
        const result = await searchMultipleGitHubPullRequests({
          queries: [withContext({
            query: opts.query,
            owner: opts.owner,
            repo: opts.repo,
            prNumber: opts.prNumber ? parseInt(opts.prNumber, 10) : undefined,
            state: opts.state,
            author: opts.author,
            assignee: opts.assignee,
            label: opts.label?.split(',').map((l: string) => l.trim()),
            head: opts.head,
            base: opts.base,
            merged: opts.merged,
            draft: opts.draft,
            created: opts.created,
            updated: opts.updated,
            sort: opts.sort,
            order: opts.order,
            limit: parseInt(opts.limit, 10),
            page: parseInt(opts.page, 10),
            withComments: opts.withComments ?? false,
            withCommits: opts.withCommits ?? false,
            type: opts.contentType,
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
