/**
 * Install Flow - Main installation orchestration
 */

import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, select, Separator } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import {
  selectMCPClient,
  promptLocalTools,
  promptGitHubAuth,
} from './prompts.js';
import {
  printConfigPreview,
  printInstallError,
  printExistingOctocodeConfig,
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
import type { OctocodeEnvOptions, MCPClient } from '../../utils/mcp-config.js';

type FinalChoice = 'proceed' | 'back' | 'cancel';

/**
 * Installation flow steps
 */
type InstallStep =
  | 'client'
  | 'updateConfirm'
  | 'localTools'
  | 'githubAuth'
  | 'confirm'
  | 'install'
  | 'done';

/**
 * State for the install flow
 */
interface InstallFlowState {
  client: MCPClient | null;
  customPath?: string;
  hasExistingOctocode: boolean;
  enableLocal: boolean;
  githubAuth: { method: 'gh-cli' | 'token' | 'skip'; token?: string };
}

/**
 * Run the interactive install flow with back navigation support
 */
export async function runInstallFlow(): Promise<void> {
  await loadInquirer();

  // Configure MCP section
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  📦 ${bold('Configure MCP server for your environment')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Initialize state
  const state: InstallFlowState = {
    client: null,
    hasExistingOctocode: false,
    enableLocal: false,
    githubAuth: { method: 'skip' },
  };

  let currentStep: InstallStep = 'client';

  // Step-based flow with back navigation
  while (currentStep !== 'done') {
    switch (currentStep) {
      case 'client': {
        const selection = await selectMCPClient();
        if (!selection) {
          // User chose back from client selection - exit flow
          return;
        }
        state.client = selection.client;
        state.customPath = selection.customPath;

        // Check for existing octocode configuration
        const configPath = state.customPath || getMCPConfigPath(state.client);
        const existingConfig = readMCPConfig(configPath);
        state.hasExistingOctocode = !!existingConfig?.mcpServers?.octocode;

        if (state.hasExistingOctocode) {
          currentStep = 'updateConfirm';
        } else {
          currentStep = 'localTools';
        }
        break;
      }

      case 'updateConfirm': {
        const configPath = state.customPath || getMCPConfigPath(state.client!);
        const existingConfig = readMCPConfig(configPath);

        console.log();
        console.log(c('yellow', '  ┌' + '─'.repeat(60) + '┐'));
        console.log(
          c('yellow', '  │ ') +
            `${c('yellow', '⚠')} ${bold('Octocode is already configured!')}` +
            ' '.repeat(28) +
            c('yellow', '│')
        );
        console.log(c('yellow', '  └' + '─'.repeat(60) + '┘'));
        console.log();

        console.log(`  ${bold('Current octocode configuration:')}`);
        printExistingOctocodeConfig(existingConfig!.mcpServers.octocode);

        console.log();
        console.log(`  ${dim('Config file:')} ${c('cyan', configPath)}`);
        console.log();

        type UpdateChoice = 'update' | 'back';
        const updateChoice = await select<UpdateChoice>({
          message: 'What would you like to do?',
          choices: [
            {
              name: `${c('green', '✓')} Update existing configuration`,
              value: 'update' as const,
            },
            new Separator() as unknown as { name: string; value: UpdateChoice },
            {
              name: `${c('dim', '← Back to client selection')}`,
              value: 'back' as const,
            },
          ],
          loop: false,
        });

        if (updateChoice === 'back') {
          currentStep = 'client';
        } else {
          currentStep = 'localTools';
        }
        break;
      }

      case 'localTools': {
        const enableLocal = await promptLocalTools();
        if (enableLocal === null) {
          // User chose back
          currentStep = state.hasExistingOctocode ? 'updateConfirm' : 'client';
        } else {
          state.enableLocal = enableLocal;
          currentStep = 'githubAuth';
        }
        break;
      }

      case 'githubAuth': {
        const githubAuth = await promptGitHubAuth();
        if (githubAuth === null) {
          // User chose back
          currentStep = 'localTools';
        } else {
          state.githubAuth = githubAuth;
          currentStep = 'confirm';
        }
        break;
      }

      case 'confirm': {
        const shouldProceed = await showConfirmationAndPrompt(state);
        if (shouldProceed === 'proceed') {
          currentStep = 'install';
        } else if (shouldProceed === 'back') {
          currentStep = 'githubAuth';
        } else {
          // cancel
          console.log(`  ${dim('Configuration cancelled.')}`);
          return;
        }
        break;
      }

      case 'install': {
        await performInstall(state);
        currentStep = 'done';
        break;
      }
    }
  }
}

/**
 * Show confirmation preview and prompt for final decision
 */
async function showConfirmationAndPrompt(
  state: InstallFlowState
): Promise<FinalChoice> {
  const clientInfo = MCP_CLIENTS[state.client!];
  const method = 'npx' as const;

  // Build environment options
  const envOptions: OctocodeEnvOptions = {};
  if (state.enableLocal) {
    envOptions.enableLocal = true;
  }
  if (state.githubAuth.method === 'token' && state.githubAuth.token) {
    envOptions.githubToken = state.githubAuth.token;
  }

  // Get install preview
  const preview = getInstallPreviewForClient(
    state.client!,
    method,
    state.customPath,
    envOptions
  );

  // Show action info
  console.log();
  if (state.hasExistingOctocode) {
    console.log(
      `  ${c('yellow', '⚠')} Will ${c('yellow', 'UPDATE')} existing octocode configuration`
    );
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
  console.log(`    ${dim('Client:')}       ${clientInfo.name}`);
  console.log(`    ${dim('Method:')}       npx (octocode-mcp@latest)`);

  const localStatus = state.enableLocal
    ? c('green', 'Enabled')
    : c('dim', 'Disabled');
  console.log(`    ${dim('Local Tools:')} ${localStatus}`);

  let authStatus: string;
  if (state.githubAuth.method === 'token') {
    authStatus = c('green', 'Token configured');
  } else if (state.githubAuth.method === 'gh-cli') {
    authStatus = c('cyan', 'Using gh CLI');
  } else {
    authStatus = c('dim', 'Not configured');
  }
  console.log(`    ${dim('GitHub Auth:')} ${authStatus}`);

  let actionStatus: string;
  if (state.hasExistingOctocode) {
    actionStatus = c('yellow', 'UPDATE');
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

  // Final confirmation with back option
  const choice = await select<FinalChoice>({
    message: 'What would you like to do?',
    choices: [
      {
        name: `${c('green', '✓')} Proceed with configuration`,
        value: 'proceed' as const,
      },
      new Separator() as unknown as { name: string; value: FinalChoice },
      {
        name: `${c('dim', '← Back to edit options')}`,
        value: 'back' as const,
      },
      {
        name: `${c('dim', '✗ Cancel')}`,
        value: 'cancel' as const,
      },
    ],
    loop: false,
  });

  return choice;
}

/**
 * Perform the actual installation
 */
async function performInstall(state: InstallFlowState): Promise<void> {
  const method = 'npx' as const;

  // Build environment options
  const envOptions: OctocodeEnvOptions = {};
  if (state.enableLocal) {
    envOptions.enableLocal = true;
  }
  if (state.githubAuth.method === 'token' && state.githubAuth.token) {
    envOptions.githubToken = state.githubAuth.token;
  }

  const preview = getInstallPreviewForClient(
    state.client!,
    method,
    state.customPath,
    envOptions
  );

  // Install
  const spinner = new Spinner('Configuring octocode-mcp...').start();
  await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for UX

  const result = installOctocodeForClient({
    client: state.client!,
    method,
    customPath: state.customPath,
    force: state.hasExistingOctocode,
    envOptions,
  });

  if (result.success) {
    spinner.succeed('Octocode configured successfully!');
    printInstallSuccessForClient(result, state.client!, preview.configPath);
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
