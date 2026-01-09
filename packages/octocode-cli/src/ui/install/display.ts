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
  const hasEnv = config.env && Object.keys(config.env).length > 0;
  const args = config.args ?? [];

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
  args.forEach((arg, i) => {
    const isLast = i === args.length - 1;
    const truncated = arg.length > 50 ? arg.slice(0, 47) + '...' : arg;
    console.log(
      c('dim', '          ') +
        c('green', `"${truncated}"`) +
        (isLast && !hasEnv ? '' : c('dim', ','))
    );
  });
  console.log(c('dim', '        ]') + (hasEnv ? c('dim', ',') : ''));

  // Print env if present
  if (hasEnv && config.env) {
    console.log(c('dim', '        "env": {'));
    const envEntries = Object.entries(config.env);
    envEntries.forEach(([key, value], i) => {
      const isLast = i === envEntries.length - 1;
      // Mask token values for security
      const lowerKey = key.toLowerCase();
      const isSensitive =
        lowerKey.includes('token') || lowerKey.includes('secret');
      const displayValue = isSensitive ? '***' : value;
      console.log(
        c('dim', '          ') +
          c('cyan', `"${key}"`) +
          c('dim', ': ') +
          c('green', `"${displayValue}"`) +
          (isLast ? '' : c('dim', ','))
      );
    });
    console.log(c('dim', '        }'));
  }

  console.log(c('dim', '      }'));
  console.log(c('dim', '    }'));
  console.log(c('dim', '  }'));
  console.log();
}

/**
 * Print install success message
 */
function _printInstallSuccess(result: InstallResult, ide: IDE): void {
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
 * Print existing octocode configuration
 */
export function printExistingOctocodeConfig(server: MCPServer): void {
  const boxWidth = 60;

  console.log();
  console.log(c('cyan', '  ┌' + '─'.repeat(boxWidth) + '┐'));

  // Command line or URL
  let commandLine: string;
  if (server.url) {
    commandLine = server.url;
  } else {
    const args = server.args ?? [];
    commandLine = server.command
      ? `${server.command} ${args.join(' ')}`.trim()
      : '(no command configured)';
  }
  const maxLen = boxWidth - 4;
  const displayCommand =
    commandLine.length > maxLen
      ? commandLine.slice(0, maxLen - 3) + '...'
      : commandLine;
  const cmdPadding = Math.max(0, boxWidth - 2 - displayCommand.length);
  console.log(
    c('cyan', '  │ ') +
      dim(displayCommand) +
      ' '.repeat(cmdPadding) +
      c('cyan', '│')
  );

  // Show env vars if present
  if (server.env && Object.keys(server.env).length > 0) {
    console.log(c('cyan', '  │') + ' '.repeat(boxWidth) + c('cyan', '│'));
    const envLabel = 'Environment:';
    const envPadding = boxWidth - 2 - envLabel.length;
    console.log(
      c('cyan', '  │ ') +
        bold(envLabel) +
        ' '.repeat(envPadding) +
        c('cyan', '│')
    );

    for (const [key, value] of Object.entries(server.env)) {
      const lowerKey = key.toLowerCase();
      const isSensitive =
        lowerKey.includes('token') || lowerKey.includes('secret');
      const displayValue = isSensitive ? '***' : value;
      const envLine = `  ${key}: ${displayValue}`;
      const truncatedEnv =
        envLine.length > maxLen
          ? envLine.slice(0, maxLen - 3) + '...'
          : envLine;
      const padding = Math.max(0, boxWidth - 2 - truncatedEnv.length);
      console.log(
        c('cyan', '  │ ') +
          dim(truncatedEnv) +
          ' '.repeat(padding) +
          c('cyan', '│')
      );
    }
  }

  console.log(c('cyan', '  └' + '─'.repeat(boxWidth) + '┘'));
}

/**
 * Print existing MCP configuration (all servers)
 */
function _printExistingMCPConfig(config: MCPConfig): void {
  const servers = config.mcpServers || {};
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0) {
    return;
  }

  const boxWidth = 60;
  const contentWidth = boxWidth - 2; // Account for spaces inside borders

  console.log();
  console.log(c('cyan', '  ┌' + '─'.repeat(boxWidth) + '┐'));

  for (const name of serverNames) {
    const server = servers[name];
    if (!server) continue;

    // Format: "name: command args..." or "name: url"
    let fullCommand: string;
    if (server.url) {
      fullCommand = server.url;
    } else {
      const command = server.command ?? '';
      const args = (server.args ?? []).join(' ');
      fullCommand = `${command} ${args}`.trim() || '(no command)';
    }

    // Calculate available space for command
    const nameLen = name.length;
    const separatorLen = 2; // ": "
    const availableForCommand = contentWidth - nameLen - separatorLen;
    const truncatedCommand =
      fullCommand.length > availableForCommand
        ? fullCommand.slice(0, availableForCommand - 3) + '...'
        : fullCommand;

    const displayName = c('magenta', name);
    const separator = dim(': ');
    const line = `${displayName}${separator}${dim(truncatedCommand)}`;

    // Calculate padding (accounting for ANSI codes)
    const visibleLen = nameLen + separatorLen + truncatedCommand.length;
    const padding = Math.max(0, contentWidth - visibleLen);

    console.log(
      c('cyan', '  │ ') + line + ' '.repeat(padding) + c('cyan', '│')
    );
  }

  console.log(c('cyan', '  └' + '─'.repeat(boxWidth) + '┘'));
}
