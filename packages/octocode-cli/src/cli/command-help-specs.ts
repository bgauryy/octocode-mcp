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
];

export function findStaticCommandHelp(name: string): CLICommand | undefined {
  return STATIC_COMMAND_HELP.find(
    command => command.name === name || command.aliases?.includes(name)
  );
}
