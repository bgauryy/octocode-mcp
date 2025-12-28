/**
 * Install Flow - Main installation orchestration
 */

import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, confirm } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import {
  selectMCPClient,
  promptLocalTools,
  promptGitHubAuth,
} from './prompts.js';
import {
  printConfigPreview,
  printInstallError,
  printExistingMCPConfig,
} from './display.js';
import {
  installOctocodeForClient,
  getInstallPreviewForClient,
} from '../../features/install.js';
import {
  readMCPConfig,
  getMCPConfigPath,
  MCP_CLIENTS,
} from '../../utils/mcp-config.js';
import type { OctocodeEnvOptions } from '../../utils/mcp-config.js';

/**
 * Run the interactive install flow
 */
export async function runInstallFlow(): Promise<void> {
  await loadInquirer();

  // Configure MCP section
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  📦 ${bold('Configure MCP server for your environment')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Select MCP client (with smart detection)
  const selection = await selectMCPClient();
  if (!selection) return;

  const { client, customPath } = selection;
  const clientInfo = MCP_CLIENTS[client];

  // Show existing MCP configuration if it exists
  const configPath = customPath || getMCPConfigPath(client);
  const existingConfig = readMCPConfig(configPath);

  if (
    existingConfig &&
    existingConfig.mcpServers &&
    Object.keys(existingConfig.mcpServers).length > 0
  ) {
    console.log();
    console.log(`  ${bold('Current MCP Configuration:')}`);
    printExistingMCPConfig(existingConfig);
  }

  // Only npx method is now supported
  const method = 'npx' as const;

  // Collect environment options
  const envOptions: OctocodeEnvOptions = {};

  // Prompt for local tools
  const enableLocal = await promptLocalTools();
  if (enableLocal) {
    envOptions.enableLocal = true;
  }

  // Prompt for GitHub authentication
  const githubAuth = await promptGitHubAuth();
  if (githubAuth.method === 'token' && githubAuth.token) {
    envOptions.githubToken = githubAuth.token;
  }

  // Get install preview using shared function
  const preview = getInstallPreviewForClient(
    client,
    method,
    customPath,
    envOptions
  );

  // Show config path prominently
  console.log();
  console.log(c('cyan', '  ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('cyan', '  │ ') +
      `${c('cyan', '📁')} ${bold('Configuration will be saved to:')}` +
      ' '.repeat(23) +
      c('cyan', '│')
  );
  console.log(c('cyan', '  │') + ' '.repeat(60) + c('cyan', '│'));
  const pathDisplay =
    preview.configPath.length > 56
      ? '...' + preview.configPath.slice(-53)
      : preview.configPath;
  console.log(
    c('cyan', '  │ ') +
      c('green', pathDisplay) +
      ' '.repeat(Math.max(0, 58 - pathDisplay.length)) +
      c('cyan', '│')
  );
  console.log(c('cyan', '  └' + '─'.repeat(60) + '┘'));

  // Handle existing installation
  if (preview.action === 'override') {
    console.log();
    console.log(c('yellow', '  ┌' + '─'.repeat(60) + '┐'));
    console.log(
      c('yellow', '  │ ') +
        `${c('yellow', '⚠')} ${bold('Octocode is already configured!')}` +
        ' '.repeat(28) +
        c('yellow', '│')
    );
    console.log(c('yellow', '  │') + ' '.repeat(60) + c('yellow', '│'));
    console.log(
      c('yellow', '  │ ') +
        `Current method: ${bold(preview.existingMethod || 'unknown')}` +
        ' '.repeat(60 - 18 - (preview.existingMethod?.length || 7)) +
        c('yellow', '│')
    );
    console.log(c('yellow', '  └' + '─'.repeat(60) + '┘'));

    const overwrite = await confirm({
      message: `${c('yellow', 'OVERRIDE')} existing configuration?`,
      default: false,
    });
    if (!overwrite) {
      console.log(`  ${dim('Configuration unchanged.')}`);
      return;
    }
  } else if (preview.action === 'add') {
    console.log();
    console.log(
      `  ${c('blue', 'ℹ')} Config file exists, will ${c('green', 'ADD')} octocode entry`
    );
  } else {
    console.log();
    console.log(
      `  ${c('green', '✓')} Will ${c('green', 'CREATE')} new config file`
    );
  }

  // Show configuration preview
  console.log();
  console.log(c('blue', '  ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('blue', '  │ ') +
      bold('Configuration to be added:') +
      ' '.repeat(33) +
      c('blue', '│')
  );
  console.log(c('blue', '  └' + '─'.repeat(60) + '┘'));
  printConfigPreview(preview.serverConfig);

  // Final summary
  console.log();
  console.log(`  ${bold('Summary:')}`);
  console.log(`    ${dim('Client:')}       ${clientInfo.name}`);
  console.log(`    ${dim('Method:')}       npx (octocode-mcp@latest)`);

  const localStatus = envOptions.enableLocal
    ? c('green', 'Enabled')
    : c('dim', 'Disabled');
  console.log(`    ${dim('Local Tools:')} ${localStatus}`);

  let authStatus: string;
  if (githubAuth.method === 'token') {
    authStatus = c('green', 'Token configured');
  } else if (githubAuth.method === 'gh-cli') {
    authStatus = c('cyan', 'Using gh CLI');
  } else {
    authStatus = c('dim', 'Not configured');
  }
  console.log(`    ${dim('GitHub Auth:')} ${authStatus}`);

  let actionStatus: string;
  if (preview.action === 'override') {
    actionStatus = c('yellow', 'OVERRIDE');
  } else if (preview.action === 'add') {
    actionStatus = c('green', 'ADD');
  } else {
    actionStatus = c('green', 'CREATE');
  }
  console.log(`    ${dim('Action:')}       ${actionStatus}`);
  console.log();

  // Security reminder
  console.log(`  ${c('yellow', '⚠')} ${bold('Note:')}`);
  console.log(
    `  ${dim('Nothing is saved to any server. Configuration is stored locally at:')}`
  );
  console.log(`  ${c('cyan', preview.configPath)}`);
  console.log();

  const proceed = await confirm({
    message: 'Proceed with configuration?',
    default: true,
  });

  if (!proceed) {
    console.log(`  ${dim('Configuration cancelled.')}`);
    return;
  }

  // Install
  const spinner = new Spinner('Configuring octocode-mcp...').start();
  await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for UX

  const result = installOctocodeForClient({
    client,
    method,
    customPath,
    force: preview.action === 'override',
    envOptions,
  });

  if (result.success) {
    spinner.succeed('Octocode configured successfully!');
    printInstallSuccessForClient(result, client, preview.configPath);
  } else {
    spinner.fail('Configuration failed');
    printInstallError(result);
  }
}

/**
 * Print success message for client installation
 */
function printInstallSuccessForClient(
  result: { configPath: string; backupPath?: string },
  client: string,
  configPath: string
): void {
  const clientInfo = MCP_CLIENTS[client as keyof typeof MCP_CLIENTS];
  console.log();
  console.log(c('green', '  ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('green', '  │ ') +
      `${c('green', '✓')} ${bold('Octocode installed successfully!')}` +
      ' '.repeat(26) +
      c('green', '│')
  );
  console.log(c('green', '  └' + '─'.repeat(60) + '┘'));
  console.log();

  // Show where config was saved prominently
  console.log(`  ${bold('Configuration saved to:')}`);
  console.log(`  ${c('cyan', configPath)}`);
  console.log();

  if (result.backupPath) {
    console.log(`  ${dim('Backup saved to:')} ${result.backupPath}`);
    console.log();
  }

  console.log(`  ${bold('Next steps:')}`);
  console.log(`    1. Restart ${clientInfo?.name || client}`);
  console.log(`    2. Look for ${c('cyan', 'octocode')} in MCP servers`);
  console.log();
}
