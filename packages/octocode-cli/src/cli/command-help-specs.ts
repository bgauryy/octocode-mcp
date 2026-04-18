import { c, bold, dim } from '../utils/colors.js';
import type { CLICommand } from './types.js';

const STATIC_COMMAND_HELP: CLICommand[] = [
  {
    name: 'search-code',
    description: 'Search code in GitHub repositories',
    usage:
      "octocode search-code --query '<terms>' [--owner <org>] [--repo <name>] [--path <path>] [--extension <ext>] [--limit <n>] [--json]",
    options: [
      {
        name: 'query',
        description:
          'Search terms (comma-separated for multiple). Maps to keywordsToSearch. [required]',
        hasValue: true,
      },
      { name: 'owner', description: 'Repository owner', hasValue: true },
      { name: 'repo', description: 'Repository name', hasValue: true },
      {
        name: 'path',
        description: 'Path filter (directory prefix)',
        hasValue: true,
      },
      { name: 'filename', description: 'Filename filter', hasValue: true },
      {
        name: 'extension',
        description: 'File extension (without dot)',
        hasValue: true,
      },
      { name: 'match', description: 'Match on: path | file', hasValue: true },
      { name: 'limit', description: 'Max results', hasValue: true },
      { name: 'page', description: 'Page number', hasValue: true },
      {
        name: 'json',
        description: 'Print raw JSON result envelope to stdout',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'get-file',
    description: 'Fetch file content from a GitHub repository',
    usage:
      'octocode get-file --owner <org> --repo <name> --path <path> [--match-string <text>] [--start-line <n>] [--end-line <n>] [--full-content] [--json]',
    options: [
      { name: 'owner', description: 'Repository owner [required]', hasValue: true },
      { name: 'repo', description: 'Repository name [required]', hasValue: true },
      { name: 'path', description: 'File path in repo [required]', hasValue: true },
      { name: 'branch', description: 'Branch or ref (default: main)', hasValue: true },
      { name: 'type', description: 'Entry type: file | directory', hasValue: true },
      {
        name: 'match-string',
        description: 'Return only lines around this match',
        hasValue: true,
      },
      {
        name: 'match-context-lines',
        description: 'Context lines around matchString',
        hasValue: true,
      },
      { name: 'start-line', description: 'Start line (1-based)', hasValue: true },
      { name: 'end-line', description: 'End line (inclusive)', hasValue: true },
      {
        name: 'full-content',
        description: 'Return full file (ignores start/end/match)',
      },
      {
        name: 'json',
        description: 'Print raw JSON result envelope to stdout',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'view-structure',
    description: 'View directory structure of a GitHub repository',
    usage:
      'octocode view-structure --owner <org> --repo <name> [--path <path>] [--depth <n>] [--branch <ref>] [--json]',
    options: [
      { name: 'owner', description: 'Repository owner [required]', hasValue: true },
      { name: 'repo', description: 'Repository name [required]', hasValue: true },
      { name: 'branch', description: 'Branch or ref', hasValue: true },
      { name: 'path', description: 'Starting path (default: repo root)', hasValue: true },
      { name: 'depth', description: 'Tree depth', hasValue: true },
      { name: 'entries-per-page', description: 'Entries per page', hasValue: true },
      { name: 'entry-page-number', description: 'Page number (1-based)', hasValue: true },
      {
        name: 'json',
        description: 'Print raw JSON result envelope to stdout',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'search-repos',
    description: 'Search GitHub repositories',
    usage:
      "octocode search-repos --query '<terms>' [--owner <org>] [--limit <n>] [--sort <stars|updated|forks|best-match>] [--json]",
    options: [
      {
        name: 'query',
        description:
          'Search terms (comma-separated). Maps to keywordsToSearch.',
        hasValue: true,
      },
      {
        name: 'topics',
        description: 'Topic list (comma-separated). Maps to topicsToSearch.',
        hasValue: true,
      },
      { name: 'owner', description: 'Filter by owner', hasValue: true },
      { name: 'stars', description: 'Star range, e.g. ">=100" or "10..500"', hasValue: true },
      { name: 'size', description: 'Size range in KB', hasValue: true },
      { name: 'created', description: 'Created-at date range', hasValue: true },
      { name: 'updated', description: 'Updated-at date range', hasValue: true },
      { name: 'sort', description: 'Sort by: stars | updated | forks | best-match', hasValue: true },
      { name: 'limit', description: 'Max results', hasValue: true },
      { name: 'page', description: 'Page number', hasValue: true },
      {
        name: 'json',
        description: 'Print raw JSON result envelope to stdout',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'search-prs',
    description: 'Search GitHub pull requests',
    usage:
      "octocode search-prs [--owner <org>] [--repo <name>] [--query '<text>'] [--state <open|closed>] [--author <user>] [--limit <n>] [--json]",
    options: [
      { name: 'query', description: 'Free-text search', hasValue: true },
      { name: 'owner', description: 'Repository owner', hasValue: true },
      { name: 'repo', description: 'Repository name', hasValue: true },
      { name: 'pr-number', description: 'Specific PR number', hasValue: true },
      { name: 'state', description: 'Filter by state: open | closed', hasValue: true },
      { name: 'author', description: 'Author username', hasValue: true },
      { name: 'assignee', description: 'Assignee username', hasValue: true },
      { name: 'commenter', description: 'Commenter username', hasValue: true },
      { name: 'involves', description: 'User involved (any role)', hasValue: true },
      { name: 'mentions', description: 'User mentioned', hasValue: true },
      { name: 'head', description: 'Head branch name', hasValue: true },
      { name: 'base', description: 'Base branch name', hasValue: true },
      { name: 'created', description: 'Created-at date range', hasValue: true },
      { name: 'updated', description: 'Updated-at date range', hasValue: true },
      { name: 'closed', description: 'Closed-at date range', hasValue: true },
      { name: 'merged', description: 'Merged PRs only' },
      { name: 'draft', description: 'Draft PRs only' },
      { name: 'sort', description: 'Sort by: created | updated | best-match', hasValue: true },
      { name: 'order', description: 'Sort order: asc | desc', hasValue: true },
      { name: 'limit', description: 'Max results', hasValue: true },
      { name: 'page', description: 'Page number', hasValue: true },
      { name: 'with-comments', description: 'Include comments' },
      { name: 'with-commits', description: 'Include commits' },
      { name: 'type', description: 'Detail level: fullContent | metadata | partialContent', hasValue: true },
      {
        name: 'json',
        description: 'Print raw JSON result envelope to stdout',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'package-search',
    description: 'Search npm or Python packages',
    usage:
      'octocode package-search --name <package> --ecosystem <npm|python> [--search-limit <n>] [--json]',
    options: [
      { name: 'name', description: 'Package name [required]', hasValue: true },
      { name: 'ecosystem', description: 'Ecosystem: npm | python [required]', hasValue: true },
      { name: 'search-limit', description: 'Max matches', hasValue: true },
      { name: 'npm-fetch-metadata', description: 'Fetch npm metadata (npm only)' },
      { name: 'python-fetch-metadata', description: 'Fetch PyPI metadata (python only)' },
      {
        name: 'json',
        description: 'Print raw JSON result envelope to stdout',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'install',
    aliases: ['i', 'setup'],
    description: 'Install octocode-mcp for an IDE',
    usage: 'octocode install --ide <ide> [--method <npx|direct>] [--force]',
    options: [
      {
        name: 'ide',
        description:
          'IDE to configure: cursor, claude-desktop, claude-code, windsurf, zed, vscode-cline, vscode-roo, vscode-continue, opencode, trae, antigravity, codex, gemini-cli, goose, kiro',
        hasValue: true,
      },
      {
        name: 'method',
        short: 'm',
        description: 'Installation method (npx or direct)',
        hasValue: true,
        default: 'npx',
      },
      {
        name: 'force',
        short: 'f',
        description: 'Overwrite existing configuration',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'auth',
    aliases: ['a', 'gh'],
    description: 'Manage GitHub authentication',
    usage: 'octocode auth [login|logout|status|token]',
    handler: async () => {},
  },
  {
    name: 'login',
    aliases: ['l'],
    description: 'Authenticate with GitHub',
    usage: 'octocode login [--hostname <host>] [--git-protocol <ssh|https>]',
    options: [
      {
        name: 'hostname',
        short: 'H',
        description: 'GitHub Enterprise hostname (default: github.com)',
        hasValue: true,
      },
      {
        name: 'git-protocol',
        short: 'p',
        description: 'Git protocol to use (ssh or https)',
        hasValue: true,
      },
    ],
    handler: async () => {},
  },
  {
    name: 'logout',
    description: 'Sign out from GitHub',
    usage: 'octocode logout [--hostname <host>]',
    options: [
      {
        name: 'hostname',
        short: 'H',
        description: 'GitHub Enterprise hostname',
        hasValue: true,
      },
    ],
    handler: async () => {},
  },
  {
    name: 'skills',
    aliases: ['sk'],
    description: 'Install Octocode skills across AI clients',
    usage:
      'octocode skills [install|remove|list] [--skill <name>] [--targets <list>] [--mode <copy|symlink>]',
    options: [
      {
        name: 'force',
        short: 'f',
        description: 'Overwrite existing skills',
      },
      {
        name: 'skill',
        short: 'k',
        description: 'Skill folder name (used by install/remove)',
        hasValue: true,
      },
      {
        name: 'targets',
        short: 't',
        description:
          'Comma-separated targets: claude-code, claude-desktop, cursor, codex, opencode',
        hasValue: true,
      },
      {
        name: 'mode',
        short: 'm',
        description: 'Install mode: copy (default) or symlink',
        hasValue: true,
        default: 'copy',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'token',
    aliases: ['t'],
    description: 'Print the GitHub token (matches octocode-mcp priority)',
    usage:
      'octocode token [--type <auto|octocode|gh>] [--hostname <host>] [--source] [--json]',
    options: [
      {
        name: 'type',
        short: 't',
        description:
          'Token source: auto (default: env→gh→octocode), octocode, gh',
        hasValue: true,
        default: 'auto',
      },
      {
        name: 'hostname',
        short: 'H',
        description: 'GitHub Enterprise hostname (default: github.com)',
        hasValue: true,
      },
      {
        name: 'source',
        short: 's',
        description: 'Show token source and user info',
      },
      {
        name: 'json',
        short: 'j',
        description: 'Output as JSON: {"token": "...", "type": "..."}',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'status',
    aliases: ['s'],
    description: 'Show GitHub authentication status',
    usage: 'octocode status [--hostname <host>]',
    options: [
      {
        name: 'hostname',
        short: 'H',
        description: 'GitHub Enterprise hostname (default: github.com)',
        hasValue: true,
      },
    ],
    handler: async () => {},
  },
  {
    name: 'sync',
    aliases: ['sy'],
    description: 'Sync MCP configurations across all IDE clients',
    usage: 'octocode sync [--force] [--dry-run] [--status]',
    options: [
      {
        name: 'force',
        short: 'f',
        description: 'Auto-resolve conflicts (use first variant)',
      },
      {
        name: 'dry-run',
        short: 'n',
        description: 'Show what would be synced without making changes',
      },
      {
        name: 'status',
        short: 's',
        description: 'Show sync status without syncing',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'mcp',
    description: 'Non-interactive MCP marketplace management',
    usage:
      'octocode mcp [list|install|remove|status] [--id <mcp-id>] [--client <client>|--config <path>] [--search <text>] [--category <name>] [--env KEY=VALUE[,KEY=VALUE]] [--force]',
    options: [
      {
        name: 'id',
        description: 'MCP registry id (required for install/remove)',
        hasValue: true,
      },
      {
        name: 'client',
        short: 'c',
        description:
          'Target client: cursor, claude-desktop, claude-code, windsurf, trae, antigravity, zed, vscode-cline, vscode-roo, vscode-continue, opencode, codex, gemini-cli, goose, kiro',
        hasValue: true,
      },
      {
        name: 'config',
        description: 'Custom MCP config path (uses custom client)',
        hasValue: true,
      },
      {
        name: 'search',
        description: 'Filter list by id/name/description/tags',
        hasValue: true,
      },
      {
        name: 'category',
        description: 'Filter list by category',
        hasValue: true,
      },
      {
        name: 'env',
        description: 'Comma-separated env values: KEY=VALUE,KEY2=VALUE2',
        hasValue: true,
      },
      {
        name: 'installed',
        description: 'List only MCPs installed in target config',
      },
      {
        name: 'force',
        short: 'f',
        description: 'Overwrite existing MCP entry on install',
      },
    ],
    handler: async () => {},
  },
  {
    name: 'cache',
    description: 'Inspect and clean Octocode cache and logs',
    usage:
      'octocode cache [status|clean] [--repos] [--skills] [--logs] [--tools|--local|--lsp|--api] [--all]',
    options: [
      {
        name: 'repos',
        description: 'Target cloned repositories cache',
      },
      {
        name: 'skills',
        description: 'Target marketplace skills cache',
      },
      {
        name: 'logs',
        description: 'Target Octocode logs directory',
      },
      {
        name: 'all',
        short: 'a',
        description: 'Target repos + skills + logs (tool flags are advisory)',
      },
      {
        name: 'tools',
        description:
          'Target tool caches (local + lsp + api). In-memory caches clear on MCP restart.',
      },
      {
        name: 'local',
        description:
          'Target local tool cache. In-memory cache clears on MCP restart.',
      },
      {
        name: 'lsp',
        description:
          'Target LSP tool cache. In-memory cache clears on MCP restart.',
      },
      {
        name: 'api',
        description:
          'Target remote API tool cache. In-memory cache clears on MCP restart.',
      },
    ],
    handler: async () => {},
  },
];

export function findStaticCommandHelp(name: string): CLICommand | undefined {
  return STATIC_COMMAND_HELP.find(
    command => command.name === name || command.aliases?.includes(name)
  );
}

export function showStaticCommandHelp(command: CLICommand): void {
  const lines = [
    '',
    `  ${c('magenta', bold('🔍🐙 octocode-cli ' + command.name))}`,
    '',
    `  ${command.description}`,
    '',
  ];

  if (command.usage) {
    lines.push(`  ${bold('USAGE')}`);
    lines.push(`    ${command.usage.replace(/\boctocode\b/g, 'octocode-cli')}`);
    lines.push('');
  }

  if (command.options && command.options.length > 0) {
    lines.push(`  ${bold('OPTIONS')}`);
    for (const opt of command.options) {
      const shortFlag = opt.short ? `-${opt.short}, ` : '    ';
      const longFlag = `--${opt.name}`;
      const valueHint = opt.hasValue ? ` <value>` : '';
      const defaultHint =
        opt.default !== undefined ? dim(` (default: ${opt.default})`) : '';
      lines.push(`    ${c('cyan', shortFlag + longFlag + valueHint)}${defaultHint}`);
      lines.push(`        ${opt.description}`);
    }
    lines.push('');
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}
