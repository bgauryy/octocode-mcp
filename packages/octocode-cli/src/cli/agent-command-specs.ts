import type { CLICommand } from './types.js';

type FlagType = 'string' | 'number' | 'boolean' | 'array';

export interface FlagDef {
  name: string;
  short?: string;
  description: string;
  required?: boolean;
  type?: FlagType;
  field?: string;
  default?: string | number | boolean;
}

export interface AgentCommandSpec {
  name: string;
  tool: string;
  description: string;
  usage: string;
  flags: FlagDef[];
}

export const AGENT_COMMAND_SPECS: AgentCommandSpec[] = [
  {
    name: 'search-code',
    tool: 'githubSearchCode',
    description: 'Search code in GitHub repositories',
    usage:
      "octocode search-code --query '<terms>' [--owner <org>] [--repo <name>] [--path <path>] [--extension <ext>] [--limit <n>] [--json]",
    flags: [
      {
        name: 'query',
        description:
          'Search terms (comma-separated for multiple). Maps to keywordsToSearch.',
        required: true,
        type: 'array',
        field: 'keywordsToSearch',
      },
      { name: 'owner', description: 'Repository owner' },
      { name: 'repo', description: 'Repository name' },
      { name: 'path', description: 'Path filter (directory prefix)' },
      { name: 'filename', description: 'Filename filter' },
      { name: 'extension', description: 'File extension (without dot)' },
      { name: 'match', description: 'Match on: path | file' },
      { name: 'limit', description: 'Max results', type: 'number' },
      { name: 'page', description: 'Page number', type: 'number' },
    ],
  },
  {
    name: 'get-file',
    tool: 'githubGetFileContent',
    description: 'Fetch file content from a GitHub repository',
    usage:
      'octocode get-file --owner <org> --repo <name> --path <path> [--match-string <text>] [--start-line <n>] [--end-line <n>] [--full-content] [--json]',
    flags: [
      { name: 'owner', description: 'Repository owner', required: true },
      { name: 'repo', description: 'Repository name', required: true },
      { name: 'path', description: 'File path in repo', required: true },
      { name: 'branch', description: 'Branch or ref (default: main)' },
      { name: 'type', description: 'Entry type: file | directory' },
      {
        name: 'match-string',
        description: 'Return only lines around this match',
      },
      {
        name: 'match-context-lines',
        description: 'Context lines around matchString',
        type: 'number',
      },
      {
        name: 'start-line',
        description: 'Start line (1-based)',
        type: 'number',
      },
      { name: 'end-line', description: 'End line (inclusive)', type: 'number' },
      {
        name: 'full-content',
        description: 'Return full file (ignores start/end/match)',
        type: 'boolean',
      },
    ],
  },
  {
    name: 'view-structure',
    tool: 'githubViewRepoStructure',
    description: 'View directory structure of a GitHub repository',
    usage:
      'octocode view-structure --owner <org> --repo <name> [--path <path>] [--depth <n>] [--branch <ref>] [--json]',
    flags: [
      { name: 'owner', description: 'Repository owner', required: true },
      { name: 'repo', description: 'Repository name', required: true },
      { name: 'branch', description: 'Branch or ref' },
      { name: 'path', description: 'Starting path (default: repo root)' },
      { name: 'depth', description: 'Tree depth', type: 'number' },
      {
        name: 'entries-per-page',
        description: 'Entries per page',
        type: 'number',
      },
      {
        name: 'entry-page-number',
        description: 'Page number (1-based)',
        type: 'number',
      },
    ],
  },
  {
    name: 'search-repos',
    tool: 'githubSearchRepositories',
    description: 'Search GitHub repositories',
    usage:
      "octocode search-repos [--query '<terms>'] [--topics <a,b>] [--owner <org>] [--limit <n>] [--sort <stars|updated|forks|best-match>] [--json]",
    flags: [
      {
        name: 'query',
        description:
          'Search terms (comma-separated). Maps to keywordsToSearch.',
        type: 'array',
        field: 'keywordsToSearch',
      },
      {
        name: 'topics',
        description: 'Topic list (comma-separated). Maps to topicsToSearch.',
        type: 'array',
        field: 'topicsToSearch',
      },
      { name: 'owner', description: 'Filter by owner' },
      { name: 'stars', description: 'Star range, e.g. ">=100" or "10..500"' },
      { name: 'size', description: 'Size range in KB' },
      { name: 'created', description: 'Created-at date range' },
      { name: 'updated', description: 'Updated-at date range' },
      {
        name: 'sort',
        description: 'Sort by: stars | updated | forks | best-match',
      },
      { name: 'limit', description: 'Max results', type: 'number' },
      { name: 'page', description: 'Page number', type: 'number' },
    ],
  },
  {
    name: 'search-prs',
    tool: 'githubSearchPullRequests',
    description: 'Search GitHub pull requests',
    usage:
      "octocode search-prs [--owner <org>] [--repo <name>] [--query '<text>'] [--state <open|closed>] [--author <user>] [--limit <n>] [--json]",
    flags: [
      { name: 'query', description: 'Free-text search' },
      { name: 'owner', description: 'Repository owner' },
      { name: 'repo', description: 'Repository name' },
      { name: 'pr-number', description: 'Specific PR number', type: 'number' },
      { name: 'state', description: 'Filter by state: open | closed' },
      { name: 'author', description: 'Author username' },
      { name: 'assignee', description: 'Assignee username' },
      { name: 'commenter', description: 'Commenter username' },
      { name: 'involves', description: 'User involved (any role)' },
      { name: 'mentions', description: 'User mentioned' },
      { name: 'head', description: 'Head branch name' },
      { name: 'base', description: 'Base branch name' },
      { name: 'created', description: 'Created-at date range' },
      { name: 'updated', description: 'Updated-at date range' },
      { name: 'closed', description: 'Closed-at date range' },
      { name: 'merged', description: 'Merged PRs only', type: 'boolean' },
      { name: 'draft', description: 'Draft PRs only', type: 'boolean' },
      {
        name: 'sort',
        description: 'Sort by: created | updated | best-match',
      },
      { name: 'order', description: 'Sort order: asc | desc' },
      { name: 'limit', description: 'Max results', type: 'number' },
      { name: 'page', description: 'Page number', type: 'number' },
      {
        name: 'with-comments',
        description: 'Include comments',
        type: 'boolean',
      },
      {
        name: 'with-commits',
        description: 'Include commits',
        type: 'boolean',
      },
      {
        name: 'type',
        description: 'Detail level: fullContent | metadata | partialContent',
      },
    ],
  },
  {
    name: 'package-search',
    tool: 'packageSearch',
    description: 'Search npm or Python packages',
    usage:
      'octocode package-search --name <package> --ecosystem <npm|python> [--search-limit <n>] [--json]',
    flags: [
      { name: 'name', description: 'Package name', required: true },
      {
        name: 'ecosystem',
        description: 'Ecosystem: npm | python',
        required: true,
      },
      {
        name: 'search-limit',
        description: 'Max matches',
        type: 'number',
      },
      {
        name: 'npm-fetch-metadata',
        description: 'Fetch npm metadata (npm only)',
        type: 'boolean',
      },
      {
        name: 'python-fetch-metadata',
        description: 'Fetch PyPI metadata (python only)',
        type: 'boolean',
      },
    ],
  },
];

export const AGENT_SUBCOMMAND_NAMES = new Set(
  AGENT_COMMAND_SPECS.map(spec => spec.name)
);

export function findAgentCommandSpec(
  name: string
): AgentCommandSpec | undefined {
  return AGENT_COMMAND_SPECS.find(spec => spec.name === name);
}

export function toAgentHelpCommand(spec: AgentCommandSpec): CLICommand {
  return {
    name: spec.name,
    description: spec.description,
    usage: spec.usage,
    options: [
      ...spec.flags.map(flag => ({
        name: flag.name,
        short: flag.short,
        description: flag.description + (flag.required ? ' [required]' : ''),
        hasValue: flag.type !== 'boolean',
      })),
      {
        name: 'json',
        description: 'Print raw JSON result envelope to stdout',
      },
    ],
  };
}
