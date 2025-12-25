/**
 * Install Display Components
 */

import { c, bold, dim } from '../../utils/colors.js';
import type { IDE, MCPServer, MCPConfig } from '../../types/index.js';
import { IDE_INFO } from '../constants.js';
import { printGitHubAuthStatus } from '../gh-guidance.js';
import type { InstallResult } from '../../features/install.js';

/**
 * Print configuration preview
 */
export function printConfigPreview(config: MCPServer): void {
  console.log();
  console.log(c('dim', '  {'));
  console.log(c('dim', '    "mcpServers": {'));
  console.log(c('magenta', '      "octocode"') + c('dim', ': {'));
  console.log(
    c('dim', '        "command": ') +
      c('green', `"${config.command}"`) +
      c('dim', ',')
  );
  console.log(c('dim', '        "args": ['));
  config.args.forEach((arg, i) => {
    const isLast = i === config.args.length - 1;
    const truncated = arg.length > 50 ? arg.slice(0, 47) + '...' : arg;
    console.log(
      c('dim', '          ') +
        c('green', `"${truncated}"`) +
        (isLast ? '' : c('dim', ','))
    );
  });
  console.log(c('dim', '        ]'));
  console.log(c('dim', '      }'));
  console.log(c('dim', '    }'));
  console.log(c('dim', '  }'));
  console.log();
}

/**
 * Print install success message
 */
export function printInstallSuccess(result: InstallResult, ide: IDE): void {
  console.log();
  console.log(c('green', '━'.repeat(66)));
  console.log(`  ${c('green', '✓')} ${bold('Configuration Complete!')}`);
  console.log(c('green', '━'.repeat(66)));
  console.log();
  console.log(`  ${dim('Config saved to:')} ${c('cyan', result.configPath)}`);
  if (result.backupPath) {
    console.log(
      `  ${dim('Backup created:')}  ${c('yellow', result.backupPath)}`
    );
  }
  console.log();
  console.log(`  ${bold('Next steps:')}`);
  console.log(`    ${c('magenta', '1.')} Restart ${bold(IDE_INFO[ide].name)}`);
  console.log(`    ${c('magenta', '2.')} Start using Octocode MCP! 🐙`);
  console.log();

  // Show GitHub auth status
  printGitHubAuthStatus();
  console.log();
}

/**
 * Print install error message
 */
export function printInstallError(result: InstallResult): void {
  console.log();
  console.log(`  ${c('red', '✗')} ${bold('Installation failed')}`);
  if (result.error) {
    console.log(`  ${dim('Error:')} ${result.error}`);
  }
  console.log();
}

/**
 * Print existing MCP configuration
 */
export function printExistingMCPConfig(config: MCPConfig): void {
  const servers = config.mcpServers || {};
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0) {
    return;
  }

  const boxWidth = 62;

  console.log();
  console.log(c('cyan', '  ┌' + '─'.repeat(boxWidth) + '┐'));

  for (const name of serverNames) {
    const server = servers[name];
    if (!server) continue;

    // Format: "name: command args..."
    const command = server.command;
    const args = server.args.join(' ');
    const fullCommand = `${command} ${args}`;

    // Truncate if too long
    const maxContentWidth = boxWidth - 4; // Account for padding
    const displayName = c('magenta', name);
    const separator = dim(': ');

    // Calculate available space for command
    const nameLen = name.length;
    const availableForCommand = maxContentWidth - nameLen - 2; // -2 for ": "
    const truncatedCommand =
      fullCommand.length > availableForCommand
        ? fullCommand.slice(0, availableForCommand - 3) + '...'
        : fullCommand;

    const line = `${displayName}${separator}${dim(truncatedCommand)}`;

    // Calculate padding (accounting for ANSI codes)
    const visibleLen = name.length + 2 + truncatedCommand.length;
    const padding = Math.max(0, boxWidth - visibleLen);

    console.log(
      c('cyan', '  │ ') + line + ' '.repeat(padding) + c('cyan', ' │')
    );
  }

  console.log(c('cyan', '  └' + '─'.repeat(boxWidth) + '┘'));
}
