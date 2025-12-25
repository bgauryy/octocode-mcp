/**
 * Install Flow - Main installation orchestration
 */

import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, confirm } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import { INSTALL_METHOD_INFO } from '../constants.js';
import { selectMCPClient, selectInstallMethod } from './prompts.js';
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

  // Select install method
  const method = await selectInstallMethod();
  if (!method) return;

  // Get install preview using shared function
  const preview = getInstallPreviewForClient(client, method, customPath);

  // Show config path
  console.log();
  console.log(`  ${dim('📁 Config file:')} ${c('cyan', preview.configPath)}`);

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
    console.log(
      `  ${c('blue', 'ℹ')} Config file exists, will ${c('green', 'ADD')} octocode entry`
    );
  } else {
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
  console.log(`    ${dim('Client:')}   ${clientInfo.name}`);
  console.log(`    ${dim('Method:')}   ${INSTALL_METHOD_INFO[method].name}`);
  console.log(`    ${dim('Config:')}   ${preview.configPath}`);
  console.log(
    `    ${dim('Action:')}   ${preview.action === 'override' ? c('yellow', 'OVERRIDE') : preview.action === 'add' ? c('green', 'ADD') : c('green', 'CREATE')}`
  );
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
  });

  if (result.success) {
    spinner.succeed('Octocode configured successfully!');
    printInstallSuccessForClient(result, client);
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
  client: string
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
  console.log(`  ${dim('Config saved to:')} ${result.configPath}`);
  if (result.backupPath) {
    console.log(`  ${dim('Backup saved to:')} ${result.backupPath}`);
  }
  console.log();
  console.log(`  ${bold('Next steps:')}`);
  console.log(`    1. Restart ${clientInfo?.name || client}`);
  console.log(`    2. Look for ${c('cyan', 'octocode')} in MCP servers`);
  console.log();
}
