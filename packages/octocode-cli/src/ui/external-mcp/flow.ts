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
 * Allowlist of safe commands for MCP servers
 * These are standard package runners and interpreters
 */
const ALLOWED_COMMANDS = [
  'npx',
  'node',
  'python',
  'python3',
  'uvx',
  'uv',
  'docker',
  'deno',
  'bun',
  'bunx',
  'pnpm',
  'yarn',
  'npm',
];

/**
 * Validate command is in allowlist
 */
function validateCommand(command: string): boolean {
  // Extract base command (handle paths like /usr/bin/node)
  const baseCommand = command.split('/').pop()?.split(' ')[0] || '';
  return ALLOWED_COMMANDS.includes(baseCommand);
}

/**
 * Validate args don't contain shell injection characters
 */
function validateArgs(args: string[]): {
  valid: boolean;
  problematic?: string;
} {
  // Shell metacharacters that could enable injection
  const dangerousPattern = /[;&|`$(){}[\]<>!]/;

  for (const arg of args) {
    if (dangerousPattern.test(arg)) {
      return { valid: false, problematic: arg };
    }
  }
  return { valid: true };
}

/**
 * Build MCP server config from registry entry
 * Validates command and args for security
 */
function buildServerConfig(
  mcp: MCPRegistryEntry,
  envValues: Record<string, string>
): MCPServer {
  // Validate command is in allowlist
  if (!validateCommand(mcp.installConfig.command)) {
    throw new Error(
      `Untrusted command: "${mcp.installConfig.command}". ` +
        `Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`
    );
  }

  // Validate args don't contain shell injection
  const argsValidation = validateArgs(mcp.installConfig.args);
  if (!argsValidation.valid) {
    throw new Error(
      `Potentially unsafe argument detected: "${argsValidation.problematic}". ` +
        `Arguments cannot contain shell metacharacters.`
    );
  }

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
 * Check if MCP already exists in config
 */
function checkMCPExists(
  mcpId: string,
  client: MCPClient,
  customPath: string | undefined
): boolean {
  const configPath =
    client === 'custom' && customPath
      ? customPath
      : getMCPConfigPath(client, customPath);

  const config = readMCPConfig(configPath);
  if (!config || !config.mcpServers) {
    return false;
  }

  return mcpId in config.mcpServers;
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

        // Check if MCP already exists
        const mcpExists = checkMCPExists(
          state.selectedMCP!.id,
          state.client!,
          state.customPath
        );

        if (mcpExists) {
          console.log();
          console.log(
            `  ${c('yellow', '\u26A0')} MCP "${bold(state.selectedMCP!.name)}" is already installed.`
          );
          console.log();

          type DuplicateChoice = 'update' | 'skip' | 'back';
          const { select: selectPrompt, Separator } =
            await import('../../utils/prompts.js');
          const duplicateChoice = await selectPrompt<DuplicateChoice>({
            message: 'What would you like to do?',
            choices: [
              {
                name: `${c('blue', '\u21BB')} Update configuration`,
                value: 'update' as const,
              },
              {
                name: `${c('dim', '\u23ED')} Skip (keep existing)`,
                value: 'skip' as const,
              },
              new Separator() as unknown as {
                name: string;
                value: DuplicateChoice;
              },
              {
                name: `${c('dim', '\u2190 Back')}`,
                value: 'back' as const,
              },
            ],
            loop: false,
          });

          if (duplicateChoice === 'skip') {
            console.log();
            console.log(
              `  ${dim('Skipped - keeping existing configuration.')}`
            );
            return;
          }

          if (duplicateChoice === 'back') {
            currentStep = 'envVars';
            break;
          }

          // 'update' continues to installation
          console.log();
          console.log(`  ${c('blue', '\u2192')} Updating MCP configuration...`);
        }

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
