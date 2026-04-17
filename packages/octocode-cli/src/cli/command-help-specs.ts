import { c, bold, dim } from '../utils/colors.js';
import type { CLICommand } from './types.js';

const STATIC_COMMAND_HELP: CLICommand[] = [
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
