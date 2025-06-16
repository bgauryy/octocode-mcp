import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GitHubCommitsSearchParams } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult } from '../util';
import { executeGitHubCommand } from '../../utils/exec';
import { TOOL_NAMES } from '../../mcp/systemPrompts';

// Enhanced commit message parsing
interface ParsedCommitMessage {
  type?: string;
  scope?: string;
  description: string;
  body?: string;
  breakingChange?: boolean;
  isConventional: boolean;
  category:
    | 'feature'
    | 'fix'
    | 'docs'
    | 'style'
    | 'refactor'
    | 'test'
    | 'chore'
    | 'other';
}

function parseCommitMessage(message: string): ParsedCommitMessage {
  const lines = message.split('\n').filter(line => line.trim());
  const firstLine = lines[0] || '';
  const body = lines.slice(1).join('\n').trim();

  // Conventional commit pattern: type(scope): description
  const conventionalPattern = /^(\w+)(?:\(([^)]+)\))?\s*:\s*(.+)$/;
  const match = firstLine.match(conventionalPattern);

  let type: string | undefined;
  let scope: string | undefined;
  let description = firstLine;
  let isConventional = false;
  let breakingChange = false;

  if (match) {
    type = match[1].toLowerCase();
    scope = match[2];
    description = match[3];
    isConventional = true;
  }

  // Check for breaking changes
  breakingChange =
    message.includes('BREAKING CHANGE') ||
    message.includes('!:') ||
    firstLine.includes('!:');

  // Categorize commit
  let category: ParsedCommitMessage['category'] = 'other';

  if (type) {
    switch (type) {
      case 'feat':
      case 'feature':
        category = 'feature';
        break;
      case 'fix':
      case 'bugfix':
        category = 'fix';
        break;
      case 'docs':
      case 'doc':
        category = 'docs';
        break;
      case 'style':
        category = 'style';
        break;
      case 'refactor':
        category = 'refactor';
        break;
      case 'test':
      case 'tests':
        category = 'test';
        break;
      case 'chore':
      case 'build':
      case 'ci':
        category = 'chore';
        break;
    }
  } else {
    // Fallback categorization based on keywords
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes('add') ||
      lowerMessage.includes('implement') ||
      lowerMessage.includes('feature')
    ) {
      category = 'feature';
    } else if (
      lowerMessage.includes('fix') ||
      lowerMessage.includes('bug') ||
      lowerMessage.includes('resolve')
    ) {
      category = 'fix';
    } else if (
      lowerMessage.includes('doc') ||
      lowerMessage.includes('readme')
    ) {
      category = 'docs';
    } else if (
      lowerMessage.includes('refactor') ||
      lowerMessage.includes('restructure')
    ) {
      category = 'refactor';
    } else if (lowerMessage.includes('test') || lowerMessage.includes('spec')) {
      category = 'test';
    } else if (
      lowerMessage.includes('style') ||
      lowerMessage.includes('format')
    ) {
      category = 'style';
    }
  }

  return {
    type,
    scope,
    description,
    body: body || undefined,
    breakingChange,
    isConventional,
    category,
  };
}

export async function searchGitHubCommits(
  params: GitHubCommitsSearchParams
): Promise<CallToolResult> {
  // Allow exploratory search: if no query, fetch recent commits for repo/owner

  const cacheKey = generateCacheKey('gh-commits-enhanced-v1', params);

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

      // Parse and analyze results with enhanced commit message parsing
      let parsedResults;
      let totalCount = 0;
      let commits = [];

      try {
        parsedResults = JSON.parse(content);
        commits = Array.isArray(parsedResults) ? parsedResults : [];
        totalCount = commits.length;

        // Enhance each commit with parsed message data
        const enhancedCommits = commits.map((commit: any) => {
          const message = commit.commit?.message || '';
          const parsedMessage = parseCommitMessage(message);

          return {
            sha: commit.sha,
            message: message,
            parsedMessage,
            author: {
              name: commit.commit?.author?.name,
              email: commit.commit?.author?.email,
              date: commit.commit?.author?.date,
              login: commit.author?.login,
            },
            committer: {
              name: commit.commit?.committer?.name,
              email: commit.commit?.committer?.email,
              date: commit.commit?.committer?.date,
              login: commit.committer?.login,
            },
            repository: {
              name: commit.repository?.name,
              fullName: commit.repository?.fullName,
              url: commit.repository?.url,
              description: commit.repository?.description,
            },
            url: commit.url,
            parents: commit.parents?.map((p: any) => p.sha) || [],
          };
        });

        // Generate analysis
        const analysis = {
          totalCommits: totalCount,
          commitTypes: {} as Record<string, number>,
          categories: {} as Record<string, number>,
          conventionalCommits: 0,
          breakingChanges: 0,
          topAuthors: {} as Record<string, number>,
          repositories: new Set<string>(),
          dateRange: {
            earliest: '',
            latest: '',
          },
        };

        enhancedCommits.forEach(commit => {
          // Count commit types and categories
          if (commit.parsedMessage.type) {
            analysis.commitTypes[commit.parsedMessage.type] =
              (analysis.commitTypes[commit.parsedMessage.type] || 0) + 1;
          }
          analysis.categories[commit.parsedMessage.category] =
            (analysis.categories[commit.parsedMessage.category] || 0) + 1;

          if (commit.parsedMessage.isConventional)
            analysis.conventionalCommits++;
          if (commit.parsedMessage.breakingChange) analysis.breakingChanges++;

          // Count authors
          const authorName =
            commit.author.name || commit.author.login || 'Unknown';
          analysis.topAuthors[authorName] =
            (analysis.topAuthors[authorName] || 0) + 1;

          // Track repositories
          if (commit.repository?.fullName) {
            analysis.repositories.add(commit.repository.fullName);
          }

          // Track date range
          const commitDate = commit.author.date || commit.committer.date;
          if (commitDate) {
            if (
              !analysis.dateRange.earliest ||
              commitDate < analysis.dateRange.earliest
            ) {
              analysis.dateRange.earliest = commitDate;
            }
            if (
              !analysis.dateRange.latest ||
              commitDate > analysis.dateRange.latest
            ) {
              analysis.dateRange.latest = commitDate;
            }
          }
        });

        // Convert sets to arrays and sort
        const finalAnalysis = {
          ...analysis,
          repositories: Array.from(analysis.repositories),
          topAuthors: Object.entries(analysis.topAuthors)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, count]) => ({ name, commits: count })),
          commitTypes: Object.entries(analysis.commitTypes)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => ({ type, count })),
          categories: Object.entries(analysis.categories)
            .sort(([, a], [, b]) => b - a)
            .map(([category, count]) => ({ category, count })),
        };

        return createSuccessResult({
          searchType: 'commits',
          query: params.query || '',
          results: enhancedCommits,
          analysis: finalAnalysis,
          ...(totalCount === 0 && {
            suggestions: [
              `${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${params.query || 'package'}"`,
              `${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} "${params.query || 'pr'}"`,
              `${TOOL_NAMES.GITHUB_SEARCH_ISSUES} "${params.query || 'issue'}"`,
              ...(params.owner
                ? [
                    `${TOOL_NAMES.GITHUB_SEARCH_CODE} "${params.query}" owner:${params.owner}`,
                  ]
                : []),
            ],
          }),
        });
      } catch (parseError) {
        // Fallback for non-JSON content
        return createSuccessResult({
          searchType: 'commits',
          query: params.query || '',
          results: content,
          suggestions: [
            `${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${params.query || 'package'}"`,
            `${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} "${params.query || 'pr'}"`,
          ],
        });
      }
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
