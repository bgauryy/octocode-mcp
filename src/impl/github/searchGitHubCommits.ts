import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GitHubCommitsSearchParams, GitHubSearchResult } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult } from '../util';
import { executeGitHubCommand } from '../../utils/exec';

export async function searchGitHubCommits(
  params: GitHubCommitsSearchParams
): Promise<CallToolResult> {
  // Allow exploratory search: if no query, fetch recent commits for repo/owner

  const cacheKey = generateCacheKey('gh-commits', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubCommitsSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      // Parse and analyze results
      let parsedResults;
      let totalCount = 0;
      try {
        parsedResults = JSON.parse(content);
        totalCount = Array.isArray(parsedResults) ? parsedResults.length : 0;
      } catch {
        parsedResults = content;
      }

      const searchResult: GitHubSearchResult = {
        searchType: 'commits',
        query: params.query || '',
        results: parsedResults,
        rawOutput: content,
        ...(totalCount === 0 && {
          suggestions: [
            `npm_search_packages "${params.query || 'package'}"`,
            `github_search_pull_requests "${params.query || 'pr'}"`,
            `github_search_issues "${params.query || 'issue'}"`,
            ...(params.owner
              ? [`github_search_code "${params.query}" owner:${params.owner}`]
              : []),
          ],
        }),
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub commits', error);
    }
  });
}

function safeQuote(arg: string): string {
  // Quote if contains spaces, >, <, =, or other shell special chars
  if (/\s|[><=]/.test(arg)) {
    // Use single quotes, escape any single quote inside
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  return arg;
}

function buildGitHubCommitsSearchCommand(params: GitHubCommitsSearchParams): {
  command: string;
  args: string[];
} {
  // Only put the search keywords in the query string
  const query =
    params.query && params.query.trim() !== ''
      ? params.query.trim()
      : undefined;

  // Start with the base command and query (if any)
  const args: string[] = ['commits'];
  if (query) args.push(safeQuote(query));

  // Add flags for all filters, quoting as needed
  if (params.author) args.push(`--author=${safeQuote(params.author)}`);
  if (params.authorDate)
    args.push(`--author-date=${safeQuote(params.authorDate)}`);
  if (params.authorEmail)
    args.push(`--author-email=${safeQuote(params.authorEmail)}`);
  if (params.authorName)
    args.push(`--author-name=${safeQuote(params.authorName)}`);
  if (params.committer) args.push(`--committer=${safeQuote(params.committer)}`);
  if (params.committerDate)
    args.push(`--committer-date=${safeQuote(params.committerDate)}`);
  if (params.committerEmail)
    args.push(`--committer-email=${safeQuote(params.committerEmail)}`);
  if (params.committerName)
    args.push(`--committer-name=${safeQuote(params.committerName)}`);
  if (params.hash) args.push(`--hash=${safeQuote(params.hash)}`);
  if (params.parent) args.push(`--parent=${safeQuote(params.parent)}`);
  if (params.tree) args.push(`--tree=${safeQuote(params.tree)}`);
  if (params.merge !== undefined && params.merge) args.push(`--merge`);
  if (params.visibility)
    args.push(`--visibility=${safeQuote(params.visibility)}`);

  // --repo and --owner flags (avoid conflict)
  if (params.repo && params.owner) {
    args.push(`--repo=${safeQuote(params.owner + '/' + params.repo)}`);
  } else if (params.repo) {
    args.push(`--repo=${safeQuote(params.repo)}`);
  } else if (params.owner) {
    args.push(`--owner=${safeQuote(params.owner)}`);
  }

  // --sort and --order
  if (params.sort && params.sort !== 'best-match') {
    args.push(`--sort=${safeQuote(params.sort)}`);
    if (params.order) {
      args.push(`--order=${safeQuote(params.order)}`);
    }
  }

  // Always add --limit (default 50 if not specified)
  args.push(`--limit=${params.limit ?? 50}`);

  // Always add --json for consistent output
  args.push('--json=author,commit,committer,id,parents,repository,sha,url');

  return { command: 'search', args };
}
