import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, input } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import { assertDefined } from '../../utils/assert.js';
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
] as const;

/**
 * Validate command is in allowlist
 * Performs strict validation to prevent command injection via path traversal
 */
function validateCommand(command: string): {
  valid: boolean;
  error?: string;
} {
  // Reject empty commands
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Command is required' };
  }

  // Normalize and extract base command
  const trimmed = command.trim();

  // Reject commands with suspicious patterns
  if (trimmed.includes('..') || trimmed.includes('\0')) {
    return { valid: false, error: 'Command contains invalid characters' };
  }

  // Extract base command name (handle paths like /usr/bin/node)
  const segments = trimmed.split(/[/\\]/);
  const baseCommand = segments[segments.length - 1]?.split(/\s+/)[0] || '';

  // Must be exact match (case-sensitive)
  if (
    !ALLOWED_COMMANDS.includes(baseCommand as (typeof ALLOWED_COMMANDS)[number])
  ) {
    return {
      valid: false,
      error: `Untrusted command: "${baseCommand}". Allowed: ${ALLOWED_COMMANDS.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Shell metacharacters and patterns that could enable injection
 */
const DANGEROUS_PATTERNS = [
  /[;&|`$]/, // Command chaining and substitution
  /[(){}[\]]/, // Subshells and braces
  /[<>]/, // Redirects
  /[!^]/, // History expansion and negation
  /\\(?!["'\\])/, // Backslash (except escaped quotes)
  /[\n\r\x00]/, // Newlines and null bytes
  /^-/, // Leading dash (could be interpreted as flag)
  /'.*'/, // Single quotes (potential quoting issues)
  /".*\$.*"/, // Double quotes with variable expansion
];

/**
 * Validate args don't contain shell injection characters
 * More comprehensive check than simple regex
 */
function validateArgs(args: string[]): {
  valid: boolean;
  problematic?: string;
  error?: string;
} {
  if (!Array.isArray(args)) {
    return { valid: false, error: 'Arguments must be an array' };
  }

  for (const arg of args) {
    if (typeof arg !== 'string') {
      return {
        valid: false,
        problematic: String(arg),
        error: 'Argument must be a string',
      };
    }

    // Check against dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(arg)) {
        return {
          valid: false,
          problematic: arg,
          error: `Potentially unsafe argument: "${arg.slice(0, 50)}${arg.length > 50 ? '...' : ''}"`,
        };
      }
    }

    // Check for excessively long arguments (potential buffer overflow)
    if (arg.length > 4096) {
      return {
        valid: false,
        problematic: arg.slice(0, 50) + '...',
        error: 'Argument exceeds maximum length (4096 chars)',
      };
    }
  }

  return { valid: true };
}

/**
 * Validate environment variable names and values
 */
function validateEnvVars(env: Record<string, string>): {
  valid: boolean;
  problematic?: string;
  error?: string;
} {
  if (!env || typeof env !== 'object') {
    return { valid: true }; // Empty env is OK
  }

  // Valid env var name pattern (POSIX: letters, digits, underscores, not starting with digit)
  const validNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

  for (const [name, value] of Object.entries(env)) {
    // Validate name
    if (!validNamePattern.test(name)) {
      return {
        valid: false,
        problematic: name,
        error: `Invalid environment variable name: "${name}"`,
      };
    }

    // Validate value (no null bytes or control characters except tab/newline)
    if (typeof value !== 'string') {
      return {
        valid: false,
        problematic: name,
        error: `Environment variable value must be a string: "${name}"`,
      };
    }

    // Check for dangerous control characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
      return {
        valid: false,
        problematic: name,
        error: `Environment variable "${name}" contains invalid control characters`,
      };
    }

    // Check for excessively long values
    if (value.length > 32768) {
      return {
        valid: false,
        problematic: name,
        error: `Environment variable "${name}" exceeds maximum length (32KB)`,
      };
    }
  }

  return { valid: true };
}

/**
 * Build MCP server config from registry entry
 * Validates command, args, and environment variables for security
 */
function buildServerConfig(
  mcp: MCPRegistryEntry,
  envValues: Record<string, string>
): MCPServer {
  // Validate command is in allowlist
  const cmdValidation = validateCommand(mcp.installConfig.command);
  if (!cmdValidation.valid) {
    throw new Error(cmdValidation.error || 'Invalid command');
  }

  // Validate args don't contain shell injection
  const argsValidation = validateArgs(mcp.installConfig.args);
  if (!argsValidation.valid) {
    throw new Error(
      argsValidation.error ||
        `Potentially unsafe argument: "${argsValidation.problematic}"`
    );
  }

  // Merge install config env with user-provided values
  const allEnv: Record<string, string> = {
    ...(mcp.installConfig.env || {}),
    ...envValues,
  };

  // Validate environment variables (both from registry and user input)
  const envValidation = validateEnvVars(allEnv);
  if (!envValidation.valid) {
    throw new Error(
      envValidation.error ||
        `Invalid environment variable: "${envValidation.problematic}"`
    );
  }

  const config: MCPServer = {
    command: mcp.installConfig.command,
    args: [...mcp.installConfig.args],
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
        const selectedMCP = assertDefined(
          state.selectedMCP,
          'selectedMCP should be set before details step'
        );
        printMCPDetails(selectedMCP);

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
        const selectedMCP = assertDefined(
          state.selectedMCP,
          'selectedMCP should be set before envVars step'
        );
        const envResult = await promptEnvVars(selectedMCP);

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
        const selectedMCP = assertDefined(
          state.selectedMCP,
          'selectedMCP should be set before confirm step'
        );
        const client = assertDefined(
          state.client,
          'client should be set before confirm step'
        );

        const configPath =
          client === 'custom' && state.customPath
            ? state.customPath
            : getMCPConfigPath(client, state.customPath);

        // Check if MCP already exists
        const mcpExists = checkMCPExists(
          selectedMCP.id,
          client,
          state.customPath
        );

        if (mcpExists) {
          console.log();
          console.log(
            `  ${c('yellow', '\u26A0')} MCP "${bold(selectedMCP.name)}" is already installed.`
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

        printInstallPreview(selectedMCP, client, configPath, state.envValues);

        const confirmation = await confirmInstall(selectedMCP, client);

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
        const selectedMCP = assertDefined(
          state.selectedMCP,
          'selectedMCP should be set before install step'
        );
        const client = assertDefined(
          state.client,
          'client should be set before install step'
        );

        const spinner = new Spinner('Installing MCP...').start();

        const result = installExternalMCP(
          selectedMCP,
          client,
          state.customPath,
          state.envValues
        );

        if (result.success) {
          spinner.succeed('MCP installed successfully!');
          printInstallSuccess(
            selectedMCP,
            client,
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
