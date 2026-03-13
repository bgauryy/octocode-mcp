/**
 * GitHub research tool commands
 */

import type { CLICommand, ParsedArgs } from '../types.js';
import {
  searchMultipleGitHubCode,
  fetchMultipleGitHubFileContents,
  exploreMultipleRepositoryStructures,
  searchMultipleGitHubRepos,
  searchMultipleGitHubPullRequests,
  searchPackages,
} from 'octocode-mcp/public';
import { ensureInitialized } from './init.js';
import { outputResult, outputError } from './output.js';
import { withContext } from './query.js';
import { requireOption } from './index.js';

const searchCodeCommand: CLICommand = {
  name: 'search-code',
  description: 'Search code across GitHub repositories',
  usage:
    'octocode search-code --keywords <words> [--owner <owner>] [--repo <repo>]',
  options: [
    {
      name: 'keywords',
      description: 'Comma-separated keywords (max 5)',
      hasValue: true,
    },
    { name: 'owner', description: 'Repository owner', hasValue: true },
    { name: 'repo', description: 'Repository name', hasValue: true },
    {
      name: 'extension',
      description: 'File extension filter (e.g., ts, py)',
      hasValue: true,
    },
    { name: 'filename', description: 'Filename filter', hasValue: true },
    { name: 'path', description: 'Path filter', hasValue: true },
    {
      name: 'match',
      description: 'Match type: file|path (default: file)',
      hasValue: true,
      default: 'file',
    },
    {
      name: 'limit',
      description: 'Results per page (1-100)',
      hasValue: true,
      default: '10',
    },
    {
      name: 'page',
      description: 'Page number (1-10)',
      hasValue: true,
      default: '1',
    },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const keywords = requireOption(args, 'keywords', 'search-code');
    if (!keywords) return;
    try {
      await ensureInitialized();
      const result = await searchMultipleGitHubCode({
        queries: [
          withContext({
            keywordsToSearch: keywords.split(',').map(k => k.trim()),
            owner: args.options['owner'] as string | undefined,
            repo: args.options['repo'] as string | undefined,
            extension: args.options['extension'] as string | undefined,
            filename: args.options['filename'] as string | undefined,
            path: args.options['path'] as string | undefined,
            match: (args.options['match'] as string) || 'file',
            limit: parseInt((args.options['limit'] as string) || '10', 10),
            page: parseInt((args.options['page'] as string) || '1', 10),
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const getFileCommand: CLICommand = {
  name: 'get-file',
  description: 'Get file content from a GitHub repository',
  usage: 'octocode get-file --owner <owner> --repo <repo> --path <path>',
  options: [
    { name: 'owner', description: 'Repository owner', hasValue: true },
    { name: 'repo', description: 'Repository name', hasValue: true },
    { name: 'path', description: 'File path', hasValue: true },
    { name: 'branch', description: 'Branch name', hasValue: true },
    {
      name: 'type',
      description: 'Content type: file|directory (default: file)',
      hasValue: true,
      default: 'file',
    },
    { name: 'full-content', description: 'Get full file content' },
    { name: 'start-line', description: 'Start line number', hasValue: true },
    { name: 'end-line', description: 'End line number', hasValue: true },
    {
      name: 'match',
      description: 'Extract lines matching this string',
      hasValue: true,
    },
    {
      name: 'context-lines',
      description: 'Context lines around match (1-50)',
      hasValue: true,
      default: '5',
    },
    {
      name: 'char-offset',
      description: 'Character offset for pagination',
      hasValue: true,
    },
    {
      name: 'char-length',
      description: 'Character length for pagination',
      hasValue: true,
    },
    { name: 'force-refresh', description: 'Force refresh cached content' },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const owner = requireOption(args, 'owner', 'get-file');
    if (!owner) return;
    const repo = requireOption(args, 'repo', 'get-file');
    if (!repo) return;
    const path = requireOption(args, 'path', 'get-file');
    if (!path) return;
    try {
      await ensureInitialized();
      const startLine = args.options['start-line'] as string | undefined;
      const endLine = args.options['end-line'] as string | undefined;
      const charOffset = args.options['char-offset'] as string | undefined;
      const charLength = args.options['char-length'] as string | undefined;
      const result = await fetchMultipleGitHubFileContents({
        queries: [
          withContext({
            owner,
            repo,
            path,
            branch: args.options['branch'] as string | undefined,
            type: (args.options['type'] as string) || 'file',
            fullContent: Boolean(args.options['full-content']),
            startLine: startLine ? parseInt(startLine, 10) : undefined,
            endLine: endLine ? parseInt(endLine, 10) : undefined,
            matchString: args.options['match'] as string | undefined,
            matchStringContextLines: parseInt(
              (args.options['context-lines'] as string) || '5',
              10
            ),
            charOffset: charOffset ? parseInt(charOffset, 10) : undefined,
            charLength: charLength ? parseInt(charLength, 10) : undefined,
            forceRefresh: Boolean(args.options['force-refresh']),
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const treeCommand: CLICommand = {
  name: 'tree',
  description: 'View repository directory structure',
  usage: 'octocode tree --owner <owner> --repo <repo> [--path <path>]',
  options: [
    { name: 'owner', description: 'Repository owner', hasValue: true },
    { name: 'repo', description: 'Repository name', hasValue: true },
    { name: 'branch', description: 'Branch name', hasValue: true },
    {
      name: 'path',
      description: 'Directory path',
      hasValue: true,
      default: '',
    },
    {
      name: 'depth',
      description: 'Directory depth (1-2)',
      hasValue: true,
      default: '1',
    },
    {
      name: 'entries-per-page',
      description: 'Entries per page (1-200)',
      hasValue: true,
      default: '50',
    },
    { name: 'page', description: 'Page number', hasValue: true, default: '1' },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const owner = requireOption(args, 'owner', 'tree');
    if (!owner) return;
    const repo = requireOption(args, 'repo', 'tree');
    if (!repo) return;
    try {
      await ensureInitialized();
      const result = await exploreMultipleRepositoryStructures({
        queries: [
          withContext({
            owner,
            repo,
            branch: args.options['branch'] as string | undefined,
            path: (args.options['path'] as string) || '',
            depth: parseInt((args.options['depth'] as string) || '1', 10),
            entriesPerPage: parseInt(
              (args.options['entries-per-page'] as string) || '50',
              10
            ),
            entryPageNumber: parseInt(
              (args.options['page'] as string) || '1',
              10
            ),
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const searchReposCommand: CLICommand = {
  name: 'search-repos',
  description: 'Search GitHub repositories',
  usage: 'octocode search-repos --keywords <words> [--sort <field>]',
  options: [
    {
      name: 'keywords',
      description: 'Comma-separated keywords',
      hasValue: true,
    },
    { name: 'topics', description: 'Comma-separated topics', hasValue: true },
    { name: 'owner', description: 'Repository owner', hasValue: true },
    {
      name: 'stars',
      description: 'Stars filter (e.g., >100, 50..200)',
      hasValue: true,
    },
    { name: 'size', description: 'Size filter in KB', hasValue: true },
    { name: 'created', description: 'Created date filter', hasValue: true },
    { name: 'updated', description: 'Updated date filter', hasValue: true },
    {
      name: 'match',
      description: 'Match in: name,description,readme',
      hasValue: true,
    },
    {
      name: 'sort',
      description: 'Sort by: forks|stars|updated|best-match',
      hasValue: true,
    },
    {
      name: 'limit',
      description: 'Results per page (1-100)',
      hasValue: true,
      default: '10',
    },
    {
      name: 'page',
      description: 'Page number (1-10)',
      hasValue: true,
      default: '1',
    },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    try {
      await ensureInitialized();
      const keywords = args.options['keywords'] as string | undefined;
      const topics = args.options['topics'] as string | undefined;
      const match = args.options['match'] as string | undefined;
      const result = await searchMultipleGitHubRepos({
        queries: [
          withContext({
            keywordsToSearch: keywords?.split(',').map(k => k.trim()),
            topicsToSearch: topics?.split(',').map(t => t.trim()),
            owner: args.options['owner'] as string | undefined,
            stars: args.options['stars'] as string | undefined,
            size: args.options['size'] as string | undefined,
            created: args.options['created'] as string | undefined,
            updated: args.options['updated'] as string | undefined,
            match: match?.split(',').map(m => m.trim()),
            sort: args.options['sort'] as string | undefined,
            limit: parseInt((args.options['limit'] as string) || '10', 10),
            page: parseInt((args.options['page'] as string) || '1', 10),
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const searchPrsCommand: CLICommand = {
  name: 'search-prs',
  description: 'Search pull requests on GitHub',
  usage:
    'octocode search-prs [--query <text>] [--owner <owner>] [--repo <repo>]',
  options: [
    {
      name: 'query',
      description: 'Search query (max 256 chars)',
      hasValue: true,
    },
    { name: 'owner', description: 'Repository owner', hasValue: true },
    { name: 'repo', description: 'Repository name', hasValue: true },
    { name: 'pr-number', description: 'Specific PR number', hasValue: true },
    { name: 'state', description: 'State: open|closed', hasValue: true },
    { name: 'author', description: 'PR author', hasValue: true },
    { name: 'assignee', description: 'PR assignee', hasValue: true },
    { name: 'label', description: 'Comma-separated labels', hasValue: true },
    { name: 'head', description: 'Head branch', hasValue: true },
    { name: 'base', description: 'Base branch', hasValue: true },
    { name: 'merged', description: 'Only merged PRs' },
    { name: 'draft', description: 'Only draft PRs' },
    { name: 'created', description: 'Created date filter', hasValue: true },
    { name: 'updated', description: 'Updated date filter', hasValue: true },
    {
      name: 'sort',
      description: 'Sort by: created|updated|best-match',
      hasValue: true,
    },
    {
      name: 'order',
      description: 'Order: asc|desc',
      hasValue: true,
      default: 'desc',
    },
    {
      name: 'limit',
      description: 'Results per page (1-10)',
      hasValue: true,
      default: '5',
    },
    {
      name: 'page',
      description: 'Page number (1-10)',
      hasValue: true,
      default: '1',
    },
    { name: 'with-comments', description: 'Include PR comments' },
    { name: 'with-commits', description: 'Include PR commits' },
    {
      name: 'content-type',
      description: 'Content: metadata|fullContent|partialContent',
      hasValue: true,
      default: 'metadata',
    },
    {
      name: 'char-offset',
      description: 'Character offset for pagination',
      hasValue: true,
    },
    {
      name: 'char-length',
      description: 'Character length for pagination',
      hasValue: true,
    },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    try {
      await ensureInitialized();
      const prNumber = args.options['pr-number'] as string | undefined;
      const label = args.options['label'] as string | undefined;
      const charOffset = args.options['char-offset'] as string | undefined;
      const charLength = args.options['char-length'] as string | undefined;
      const result = await searchMultipleGitHubPullRequests({
        queries: [
          withContext({
            query: args.options['query'] as string | undefined,
            owner: args.options['owner'] as string | undefined,
            repo: args.options['repo'] as string | undefined,
            prNumber: prNumber ? parseInt(prNumber, 10) : undefined,
            state: args.options['state'] as string | undefined,
            author: args.options['author'] as string | undefined,
            assignee: args.options['assignee'] as string | undefined,
            label: label?.split(',').map(l => l.trim()),
            head: args.options['head'] as string | undefined,
            base: args.options['base'] as string | undefined,
            merged: Boolean(args.options['merged']),
            draft: Boolean(args.options['draft']),
            created: args.options['created'] as string | undefined,
            updated: args.options['updated'] as string | undefined,
            sort: args.options['sort'] as string | undefined,
            order: (args.options['order'] as string) || 'desc',
            limit: parseInt((args.options['limit'] as string) || '5', 10),
            page: parseInt((args.options['page'] as string) || '1', 10),
            withComments: Boolean(args.options['with-comments']),
            withCommits: Boolean(args.options['with-commits']),
            type: (args.options['content-type'] as string) || 'metadata',
            charOffset: charOffset ? parseInt(charOffset, 10) : undefined,
            charLength: charLength ? parseInt(charLength, 10) : undefined,
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

const searchPackagesCommand: CLICommand = {
  name: 'search-packages',
  description: 'Search npm or PyPI packages',
  usage: 'octocode search-packages --name <name> --ecosystem <npm|python>',
  options: [
    { name: 'name', description: 'Package name to search', hasValue: true },
    { name: 'ecosystem', description: 'Ecosystem: npm|python', hasValue: true },
    {
      name: 'limit',
      description: 'Search result limit (1-10)',
      hasValue: true,
      default: '1',
    },
    { name: 'fetch-metadata', description: 'Fetch detailed package metadata' },
    { name: 'pretty', description: 'Human-readable output' },
  ],
  handler: async (args: ParsedArgs) => {
    const name = requireOption(args, 'name', 'search-packages');
    if (!name) return;
    const ecosystem = requireOption(args, 'ecosystem', 'search-packages');
    if (!ecosystem) return;
    try {
      await ensureInitialized();
      const limit = parseInt((args.options['limit'] as string) || '1', 10);
      const isNpm = ecosystem === 'npm';
      const result = await searchPackages({
        queries: [
          withContext({
            name,
            ecosystem,
            searchLimit: limit,
            ...(isNpm
              ? { npmFetchMetadata: Boolean(args.options['fetch-metadata']) }
              : {
                  pythonFetchMetadata: Boolean(args.options['fetch-metadata']),
                }),
          }),
        ],
      });
      outputResult(result, Boolean(args.options['pretty']));
    } catch (error) {
      outputError(error);
    }
  },
};

export const githubCommands: CLICommand[] = [
  searchCodeCommand,
  getFileCommand,
  treeCommand,
  searchReposCommand,
  searchPrsCommand,
  searchPackagesCommand,
];
