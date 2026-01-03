import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, input } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import {
  selectTargetClient,
  promptEnvVars,
  confirmInstall,
  searchMCPs,
  selectByCategory,
  selectPopular,
  selectAll,
  selectBrowseMode,
} from './prompts.js';
import {
  printMCPDetails,
  printInstallPreview,
  printInstallSuccess,
  printInstallError,
} from './display.js';
import type { MCPRegistryEntry } from '../../configs/mcp-registry.js';
import type { MCPClient, MCPConfig, MCPServer } from '../../types/index.js';
import { getMCPConfigPath } from '../../utils/mcp-paths.js';
import { readMCPConfig, writeMCPConfig } from '../../utils/mcp-io.js';

type InstallStep =
  | 'client'
  | 'browse'
  | 'selectMCP'
  | 'details'
  | 'envVars'
  | 'confirm'
  | 'install'
  | 'done';

interface FlowState {
  client: MCPClient | null;
  customPath?: string;
  browseMode: 'search' | 'category' | 'popular' | 'all' | null;
  selectedMCP: MCPRegistryEntry | null;
  envValues: Record<string, string>;
}

/**
 * Build MCP server config from registry entry
 */
function buildServerConfig(
  mcp: MCPRegistryEntry,
  envValues: Record<string, string>
): MCPServer {
  const config: MCPServer = {
    command: mcp.installConfig.command,
    args: [...mcp.installConfig.args],
  };

  // Merge install config env with user-provided values
  const allEnv: Record<string, string> = {
    ...(mcp.installConfig.env || {}),
    ...envValues,
  };

  if (Object.keys(allEnv).length > 0) {
    config.env = allEnv;
  }

  return config;
}

/**
 * Install external MCP to client config
 */
function installExternalMCP(
  mcp: MCPRegistryEntry,
  client: MCPClient,
  customPath: string | undefined,
  envValues: Record<string, string>
): {
  success: boolean;
  configPath: string;
  backupPath?: string;
  error?: string;
} {
  const configPath =
    client === 'custom' && customPath
      ? customPath
      : getMCPConfigPath(client, customPath);

  // Read existing config
  let config: MCPConfig = readMCPConfig(configPath) || { mcpServers: {} };

  // Build server config
  const serverConfig = buildServerConfig(mcp, envValues);

  // Add to config
  config = {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      [mcp.id]: serverConfig,
    },
  };

  // Write config
  const writeResult = writeMCPConfig(configPath, config);

  if (!writeResult.success) {
    return {
      success: false,
      configPath,
      error: writeResult.error || 'Failed to write config',
    };
  }

  return {
    success: true,
    configPath,
    backupPath: writeResult.backupPath,
  };
}

/**
 * Press enter to continue helper
 */
async function pressEnterToContinue(): Promise<void> {
  console.log();
  await input({
    message: dim('Press Enter to continue...'),
    default: '',
  });
}

/**
 * Main flow for installing external MCPs
 */
export async function runExternalMCPFlow(): Promise<void> {
  await loadInquirer();

  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(` 🔌 ${bold('Install External MCP')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();
  console.log(`  ${dim('Browse and install from 70+ community MCP servers')}`);

  const state: FlowState = {
    client: null,
    browseMode: null,
    selectedMCP: null,
    envValues: {},
  };

  let currentStep: InstallStep = 'client';

  while (currentStep !== 'done') {
    switch (currentStep) {
      // Step 1: Select target client (IDE)
      case 'client': {
        const selection = await selectTargetClient();
        if (!selection) {
          // Back to main menu
          return;
        }
        state.client = selection.client;
        state.customPath = selection.customPath;
        currentStep = 'browse';
        break;
      }

      // Step 2: Select browse mode
      case 'browse': {
        const mode = await selectBrowseMode();
        if (mode === 'back' || mode === null) {
          currentStep = 'client';
          break;
        }
        state.browseMode = mode;
        currentStep = 'selectMCP';
        break;
      }

      // Step 3: Select MCP based on browse mode
      case 'selectMCP': {
        let result: MCPRegistryEntry | 'back' | null = null;

        switch (state.browseMode) {
          case 'search':
            result = await searchMCPs();
            break;
          case 'category':
            result = await selectByCategory();
            break;
          case 'popular':
            result = await selectPopular();
            break;
          case 'all':
            result = await selectAll();
            break;
        }

        if (result === 'back') {
          currentStep = 'browse';
          break;
        }

        if (result === null) {
          // No results or error, stay in browse mode
          currentStep = 'browse';
          break;
        }

        state.selectedMCP = result;
        currentStep = 'details';
        break;
      }

      // Step 4: Show MCP details
      case 'details': {
        printMCPDetails(state.selectedMCP!);

        type DetailChoice = 'continue' | 'back';
        const { select, Separator } = await import('../../utils/prompts.js');
        const choice = await select<DetailChoice>({
          message: 'What would you like to do?',
          choices: [
            {
              name: `${c('green', '✓')} Continue to install`,
              value: 'continue' as const,
            },
            new Separator() as unknown as { name: string; value: DetailChoice },
            {
              name: `${c('dim', '← Back to MCP list')}`,
              value: 'back' as const,
            },
          ],
          loop: false,
        });

        if (choice === 'back') {
          currentStep = 'selectMCP';
          break;
        }

        currentStep = 'envVars';
        break;
      }

      // Step 5: Configure environment variables
      case 'envVars': {
        const envResult = await promptEnvVars(state.selectedMCP!);

        if (envResult === 'back') {
          currentStep = 'details';
          break;
        }

        if (envResult === null) {
          currentStep = 'details';
          break;
        }

        state.envValues = envResult;
        currentStep = 'confirm';
        break;
      }

      // Step 6: Confirm installation
      case 'confirm': {
        const configPath =
          state.client === 'custom' && state.customPath
            ? state.customPath
            : getMCPConfigPath(state.client!, state.customPath);

        printInstallPreview(
          state.selectedMCP!,
          state.client!,
          configPath,
          state.envValues
        );

        const confirmation = await confirmInstall(
          state.selectedMCP!,
          state.client!
        );

        if (confirmation === 'back') {
          currentStep = 'envVars';
          break;
        }

        if (confirmation === 'cancel') {
          console.log();
          console.log(`  ${dim('Installation cancelled.')}`);
          return;
        }

        currentStep = 'install';
        break;
      }

      // Step 7: Perform installation
      case 'install': {
        const spinner = new Spinner('Installing MCP...').start();

        // Small delay for UX
        await new Promise(resolve => setTimeout(resolve, 500));

        const result = installExternalMCP(
          state.selectedMCP!,
          state.client!,
          state.customPath,
          state.envValues
        );

        if (result.success) {
          spinner.succeed('MCP installed successfully!');
          printInstallSuccess(
            state.selectedMCP!,
            state.client!,
            result.configPath,
            result.backupPath
          );
        } else {
          spinner.fail('Installation failed');
          printInstallError(result.error || 'Unknown error');
        }

        await pressEnterToContinue();
        currentStep = 'done';
        break;
      }
    }
  }
}
