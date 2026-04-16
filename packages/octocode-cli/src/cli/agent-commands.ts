import type { CLICommand, ParsedArgs } from './types.js';
import { executeToolCommand } from './tool-command.js';
import { c, dim } from '../utils/colors.js';

type FlagType = 'string' | 'number' | 'boolean' | 'array';

interface FlagDef {
  name: string;
  short?: string;
  description: string;
  required?: boolean;
  type?: FlagType;
  field?: string;
  default?: string | number | boolean;
}

interface AgentCommandSpec {
  name: string;
  tool: string;
  description: string;
  usage: string;
  flags: FlagDef[];
}

const AGENT_COMMAND_SPECS: AgentCommandSpec[] = [
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
      "octocode search-repos --query '<terms>' [--owner <org>] [--limit <n>] [--sort <stars|updated|forks|best-match>] [--json]",
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

function kebabToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function buildQueryFromFlags(
  spec: AgentCommandSpec,
  options: Record<string, string | boolean>
): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  for (const flag of spec.flags) {
    const value = options[flag.name];
    if (value === undefined) continue;

    const field = flag.field ?? kebabToCamel(flag.name);
    const type = flag.type ?? 'string';

    if (type === 'boolean') {
      query[field] = Boolean(value);
      continue;
    }

    if (typeof value !== 'string') {
      if (type === 'array' && value === true) {
        continue;
      }
      query[field] = value;
      continue;
    }

    if (type === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) {
        query[field] = n;
      } else {
        throw new Error(`--${flag.name} must be a number, got "${value}"`);
      }
      continue;
    }

    if (type === 'array') {
      query[field] = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      continue;
    }

    query[field] = value;
  }

  return query;
}

function validateRequiredFlags(
  spec: AgentCommandSpec,
  options: Record<string, string | boolean>
): string[] {
  const missing: string[] = [];
  for (const flag of spec.flags) {
    if (flag.required && options[flag.name] === undefined) {
      missing.push(`--${flag.name}`);
    }
  }
  return missing;
}

function printAgentError(message: string, details: string[] = []): void {
  console.error();
  console.error(`  ${c('red', 'X')} ${message}`);
  for (const detail of details) {
    console.error(`  ${dim('-')} ${detail}`);
  }
  console.error();
}

async function readStdinJson(): Promise<string | null> {
  if (process.stdin.isTTY) return null;

  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      const trimmed = data.trim();
      resolve(trimmed.length > 0 ? trimmed : null);
    });
    process.stdin.on('error', reject);
  });
}

function hasAnyFlag(
  spec: AgentCommandSpec,
  options: Record<string, string | boolean>
): boolean {
  return spec.flags.some(flag => options[flag.name] !== undefined);
}

async function runAgentSubcommand(
  spec: AgentCommandSpec,
  args: ParsedArgs
): Promise<void> {
  const stdinPayload = await readStdinJson();

  let payloadJson: string;

  if (stdinPayload !== null) {
    if (hasAnyFlag(spec, args.options)) {
      console.error(
        `  ${dim('note: stdin payload detected; ignoring command-line flags')}`
      );
    }
    payloadJson = stdinPayload;
  } else {
    const missing = validateRequiredFlags(spec, args.options);
    if (missing.length > 0) {
      printAgentError(
        `Missing required flag${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
        [
          `Usage: ${spec.usage.replace(/\boctocode\b/g, 'octocode-cli')}`,
          `Run 'octocode-cli ${spec.name} --help' for details.`,
        ]
      );
      process.exitCode = 1;
      return;
    }

    let query: Record<string, unknown>;
    try {
      query = buildQueryFromFlags(spec, args.options);
    } catch (err) {
      printAgentError(
        err instanceof Error ? err.message : 'Invalid flag value'
      );
      process.exitCode = 1;
      return;
    }

    payloadJson = JSON.stringify(query);
  }

  const toolArgs: ParsedArgs = {
    command: 'tool',
    args: [spec.tool, payloadJson],
    options: {
      tool: spec.tool,
      ...(args.options.json === true ? { json: true } : {}),
      ...(typeof args.options.output === 'string'
        ? { output: args.options.output }
        : {}),
    },
  };

  const success = await executeToolCommand(toolArgs);
  if (!success) {
    process.exitCode = 1;
  }
}

function toCLICommand(spec: AgentCommandSpec): CLICommand {
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
    handler: (args: ParsedArgs) => runAgentSubcommand(spec, args),
  };
}

export const agentCommands: CLICommand[] =
  AGENT_COMMAND_SPECS.map(toCLICommand);
