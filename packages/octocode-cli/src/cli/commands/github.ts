/**
 * GitHub research tool commands
 */

import type { CLICommand, CLIOption, ParsedArgs } from '../types.js';
import {
  searchMultipleGitHubCode,
  fetchMultipleGitHubFileContents,
  exploreMultipleRepositoryStructures,
  searchMultipleGitHubRepos,
  searchMultipleGitHubPullRequests,
  searchPackages,
  GitHubCodeSearchQuerySchema,
  FileContentQuerySchema,
  GitHubViewRepoStructureQuerySchema,
  GitHubReposSearchSingleQuerySchema,
  GitHubPullRequestSearchQuerySchema,
} from 'octocode-mcp/public';
import { createToolCommand } from '../schema-bridge.js';
import { ensureInitialized } from './init.js';
import { outputResult, outputError } from './output.js';
import { withContext } from './query.js';
import { requireOption } from './index.js';

const prettyOption: CLIOption = {
  name: 'pretty',
  description: 'Human-readable output',
};

const searchCodeCommand = createToolCommand({
  name: 'search-code',
  description: 'Search code across GitHub repositories',
  usage:
    'octocode search-code --keywords-to-search <words> [--owner <owner>] [--repo <repo>]',
  category: 'github',
  schema: GitHubCodeSearchQuerySchema,
  execute: searchMultipleGitHubCode,
  requiredOptions: ['keywords-to-search'],
  extraOptions: [prettyOption],
});

const getFileCommand = createToolCommand({
  name: 'get-file',
  description: 'Get file content from a GitHub repository',
  usage: 'octocode get-file --owner <owner> --repo <repo> --path <path>',
  category: 'github',
  schema: FileContentQuerySchema,
  execute: fetchMultipleGitHubFileContents,
  requiredOptions: ['owner', 'repo', 'path'],
  extraOptions: [prettyOption],
});

const treeCommand = createToolCommand({
  name: 'tree',
  description: 'View repository directory structure',
  usage: 'octocode tree --owner <owner> --repo <repo> [--path <path>]',
  category: 'github',
  schema: GitHubViewRepoStructureQuerySchema,
  execute: exploreMultipleRepositoryStructures,
  requiredOptions: ['owner', 'repo'],
  extraOptions: [prettyOption],
});

const searchReposCommand = createToolCommand({
  name: 'search-repos',
  description: 'Search GitHub repositories',
  usage: 'octocode search-repos --keywords-to-search <words> [--sort <field>]',
  category: 'github',
  schema: GitHubReposSearchSingleQuerySchema,
  execute: searchMultipleGitHubRepos,
  extraOptions: [prettyOption],
});

const searchPrsCommand = createToolCommand({
  name: 'search-prs',
  description: 'Search pull requests on GitHub',
  usage:
    'octocode search-prs [--query <text>] [--owner <owner>] [--repo <repo>]',
  category: 'github',
  schema: GitHubPullRequestSearchQuerySchema,
  execute: searchMultipleGitHubPullRequests,
  extraOptions: [prettyOption],
});

// search-packages uses a discriminated union schema, handled manually
const searchPackagesCommand: CLICommand = {
  name: 'search-packages',
  description: 'Search npm or PyPI packages',
  usage: 'octocode search-packages --name <name> --ecosystem <npm|python>',
  category: 'github',
  options: [
    { name: 'name', description: 'Package name to search', hasValue: true },
    { name: 'ecosystem', description: 'Ecosystem: npm|python', hasValue: true },
    {
      name: 'search-limit',
      description: 'Search result limit (1-10)',
      hasValue: true,
      default: '1',
    },
    { name: 'fetch-metadata', description: 'Fetch detailed package metadata' },
    prettyOption,
  ],
  handler: async (args: ParsedArgs) => {
    const name = requireOption(args, 'name', 'search-packages');
    if (!name) return;
    const ecosystem = requireOption(args, 'ecosystem', 'search-packages');
    if (!ecosystem) return;
    try {
      await ensureInitialized();
      const limit = parseInt(
        (args.options['search-limit'] as string) || '1',
        10
      );
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
