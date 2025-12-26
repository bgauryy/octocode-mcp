/**
 * Configuration Options UI
 *
 * Allows users to view and configure octocode-mcp server options.
 * Configurations are saved as environment variables in the MCP server config.
 */

import { c, bold, dim } from '../../utils/colors.js';
import {
  loadInquirer,
  confirm,
  select,
  Separator,
} from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import {
  readMCPConfig,
  writeMCPConfig,
  getMCPConfigPath,
  isOctocodeConfigured,
  MCP_CLIENTS,
} from '../../utils/mcp-config.js';
import { selectMCPClient } from '../install/prompts.js';
import type { MCPConfig } from '../../types/index.js';

/**
 * Configuration option definition (for checkboxes)
 */
interface ConfigOption {
  id: string;
  envVar: string;
  name: string;
  description: string;
  defaultValue: boolean;
}

/**
 * All configuration info (for display)
 */
interface ConfigInfo {
  envVar: string;
  name: string;
  description: string;
  type: 'boolean' | 'string' | 'number' | 'array';
  defaultValue: string;
  example?: string;
}

type ConfigMenuChoice = 'view' | 'toggle' | 'back';

/**
 * Available checkbox configuration options
 *
 * From serverConfig.ts - only boolean options that make sense as checkboxes:
 * - ENABLE_LOCAL: Enable local file exploration tools (default: false)
 */
const CONFIG_OPTIONS: ConfigOption[] = [
  {
    id: 'enableLocal',
    envVar: 'ENABLE_LOCAL',
    name: 'Local File Tools',
    description: 'Enable local file exploration tools (ripgrep, find, etc.)',
    defaultValue: false,
  },
];

/**
 * All available configurations (for info display)
 */
const ALL_CONFIG_INFO: ConfigInfo[] = [
  {
    envVar: 'ENABLE_LOCAL',
    name: 'Local File Tools',
    description:
      'Enable local file exploration tools for searching and browsing local files',
    type: 'boolean',
    defaultValue: 'false',
    example: 'ENABLE_LOCAL=1',
  },
  {
    envVar: 'GITHUB_API_URL',
    name: 'GitHub API URL',
    description: 'Custom GitHub API endpoint (for GitHub Enterprise)',
    type: 'string',
    defaultValue: 'https://api.github.com',
    example: 'GITHUB_API_URL=https://github.mycompany.com/api/v3',
  },
  {
    envVar: 'TOOLS_TO_RUN',
    name: 'Tools to Run',
    description:
      'Comma-separated list of specific tools to enable (all others disabled)',
    type: 'array',
    defaultValue: '(all tools)',
    example: 'TOOLS_TO_RUN=githubSearchCode,githubGetFileContent',
  },
  {
    envVar: 'ENABLE_TOOLS',
    name: 'Enable Tools',
    description: 'Comma-separated list of additional tools to enable',
    type: 'array',
    defaultValue: '(none)',
    example: 'ENABLE_TOOLS=local_ripgrep,local_find_files',
  },
  {
    envVar: 'DISABLE_TOOLS',
    name: 'Disable Tools',
    description: 'Comma-separated list of tools to disable',
    type: 'array',
    defaultValue: '(none)',
    example: 'DISABLE_TOOLS=githubSearchPullRequests',
  },
  {
    envVar: 'REQUEST_TIMEOUT',
    name: 'Request Timeout',
    description: 'API request timeout in milliseconds (minimum: 30000)',
    type: 'number',
    defaultValue: '30000',
    example: 'REQUEST_TIMEOUT=60000',
  },
  {
    envVar: 'MAX_RETRIES',
    name: 'Max Retries',
    description: 'Maximum number of API retry attempts (0-10)',
    type: 'number',
    defaultValue: '3',
    example: 'MAX_RETRIES=5',
  },
];

/**
 * Get current configuration from MCP config
 */
function getCurrentConfig(config: MCPConfig): Record<string, boolean> {
  const env = config.mcpServers?.octocode?.env || {};
  const current: Record<string, boolean> = {};

  for (const option of CONFIG_OPTIONS) {
    const value = env[option.envVar];
    if (value === undefined || value === null) {
      current[option.id] = option.defaultValue;
    } else if (option.defaultValue) {
      // Default true: enabled unless explicitly 'false'
      current[option.id] = value.toLowerCase() !== 'false';
    } else {
      // Default false: enabled only if '1' or 'true'
      current[option.id] = value === '1' || value.toLowerCase() === 'true';
    }
  }

  return current;
}

/**
 * Build environment variables from selected options
 */
function buildEnvVars(
  selectedOptions: string[],
  existingEnv: Record<string, string> = {}
): Record<string, string> {
  const env: Record<string, string> = { ...existingEnv };

  for (const option of CONFIG_OPTIONS) {
    const isSelected = selectedOptions.includes(option.id);

    if (option.defaultValue) {
      // Default true: only set if explicitly disabled
      if (!isSelected) {
        env[option.envVar] = 'false';
      } else {
        // Remove if matches default
        delete env[option.envVar];
      }
    } else {
      // Default false: only set if explicitly enabled
      if (isSelected) {
        env[option.envVar] = '1';
      } else {
        // Remove if matches default
        delete env[option.envVar];
      }
    }
  }

  return env;
}

/**
 * Show configuration submenu
 */
async function showConfigMenu(): Promise<ConfigMenuChoice> {
  const choice = await select<ConfigMenuChoice>({
    message: 'Configuration Options:',
    choices: [
      {
        name: '📋 View all configuration options',
        value: 'view',
        description: 'Show available environment variables and their defaults',
      },
      {
        name: '🔧 Toggle options for a client',
        value: 'toggle',
        description: 'Enable/disable features like local tools',
      },
      new Separator() as unknown as { name: string; value: ConfigMenuChoice },
      {
        name: `${c('dim', '← Back to main menu')}`,
        value: 'back',
      },
    ],
    pageSize: 10,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('cyan', text),
        message: (text: string) => bold(text),
      },
    },
  });

  return choice;
}

/**
 * Run the configuration options flow
 */
export async function runConfigOptionsFlow(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  ⚙️  ${bold('Configure Octocode Options')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Show submenu
  const choice = await showConfigMenu();

  switch (choice) {
    case 'view':
      showConfigInfo();
      // Wait for user to press enter before returning
      await pressEnterToContinue();
      break;

    case 'toggle':
      await runToggleOptionsFlow();
      break;

    case 'back':
    default:
      // Just return to main menu
      break;
  }
}

/**
 * Wait for user to press enter
 */
async function pressEnterToContinue(): Promise<void> {
  const { input } = await import('../../utils/prompts.js');
  console.log();
  await input({
    message: dim('Press Enter to continue...'),
    default: '',
  });
}

/**
 * Run the toggle options flow (select client, then checkbox)
 */
async function runToggleOptionsFlow(): Promise<void> {
  // Select MCP client
  const selection = await selectMCPClient();
  if (!selection) return;

  const { client, customPath } = selection;
  const clientInfo = MCP_CLIENTS[client];
  const configPath = customPath || getMCPConfigPath(client);

  // Read existing config
  const config = readMCPConfig(configPath);
  if (!config) {
    console.log();
    console.log(`  ${c('red', '✗')} Failed to read config file: ${configPath}`);
    console.log();
    return;
  }

  // Check if octocode is configured
  if (!isOctocodeConfigured(config)) {
    console.log();
    console.log(
      `  ${c('yellow', '⚠')} Octocode is not configured for ${clientInfo.name}`
    );
    console.log(
      `  ${dim('Please install octocode first using "Install octocode-mcp".')}`
    );
    console.log();
    return;
  }

  // Show current config path
  console.log();
  console.log(`  ${dim('Config file:')} ${c('cyan', configPath)}`);

  // Get current configuration
  const current = getCurrentConfig(config);

  // Prompt for each option
  const selected: string[] = [];

  for (const option of CONFIG_OPTIONS) {
    const isEnabled = current[option.id];
    const statusText = isEnabled ? c('green', 'enabled') : c('dim', 'disabled');

    console.log();
    console.log(`  ${bold(option.name)}`);
    console.log(`  ${dim(option.description)}`);
    console.log(`  ${dim('Currently:')} ${statusText}`);
    console.log();

    const enable = await confirm({
      message: `Enable ${option.name}?`,
      default: isEnabled,
    });

    if (enable) {
      selected.push(option.id);
    }
  }

  // Check if anything changed
  const hasChanges = CONFIG_OPTIONS.some(
    option => current[option.id] !== selected.includes(option.id)
  );

  if (!hasChanges) {
    console.log();
    console.log(`  ${dim('No changes made.')}`);
    console.log();
    return;
  }

  // Show what will change
  console.log();
  console.log(`  ${bold('Changes to apply:')}`);
  for (const option of CONFIG_OPTIONS) {
    const wasEnabled = current[option.id];
    const willBeEnabled = selected.includes(option.id);

    if (wasEnabled !== willBeEnabled) {
      const change = willBeEnabled
        ? c('green', '✓ Enable')
        : c('yellow', '○ Disable');
      console.log(`    ${change} ${option.name}`);
    }
  }
  console.log();

  // Confirm changes
  const proceed = await confirm({
    message: 'Apply these changes?',
    default: true,
  });

  if (!proceed) {
    console.log(`  ${dim('Configuration unchanged.')}`);
    return;
  }

  // Apply changes
  const spinner = new Spinner('Saving configuration...').start();

  const existingEnv = config.mcpServers?.octocode?.env || {};
  const newEnv = buildEnvVars(selected, existingEnv);

  // Update the config
  const updatedConfig: MCPConfig = {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      octocode: {
        ...config.mcpServers!.octocode,
        env: Object.keys(newEnv).length > 0 ? newEnv : undefined,
      },
    },
  };

  // Clean up undefined env
  if (
    updatedConfig.mcpServers?.octocode?.env &&
    Object.keys(updatedConfig.mcpServers.octocode.env).length === 0
  ) {
    delete updatedConfig.mcpServers.octocode.env;
  }

  const result = writeMCPConfig(configPath, updatedConfig);

  if (result.success) {
    spinner.succeed('Configuration saved!');
    console.log();
    console.log(`  ${c('green', '✓')} Config saved to: ${configPath}`);
    if (result.backupPath) {
      console.log(`  ${dim('Backup:')} ${result.backupPath}`);
    }
    console.log();
    console.log(
      `  ${bold('Note:')} Restart ${clientInfo.name} for changes to take effect.`
    );
    console.log();
  } else {
    spinner.fail('Failed to save configuration');
    console.log();
    console.log(`  ${c('red', '✗')} ${result.error || 'Unknown error'}`);
    console.log();
  }
}

/**
 * Show all configuration options with explanations
 */
export function showConfigInfo(): void {
  console.log();
  console.log(`  ${bold('All Available Configuration Options')}`);
  console.log();
  console.log(
    `  ${dim('These options can be set as environment variables in your MCP config.')}`
  );
  console.log(
    `  ${dim('Add them to the "env" object in your octocode server configuration.')}`
  );
  console.log();
  console.log(`  ${dim('Example config:')}`);
  console.log(`  ${dim('{')}
  ${dim('  "mcpServers": {')}
  ${dim('    "octocode": {')}
  ${dim('      "command": "npx",')}
  ${dim('      "args": ["octocode-mcp@latest"],')}
  ${c('green', '      "env": { "ENABLE_LOCAL": "1" }')}
  ${dim('    }')}
  ${dim('  }')}
  ${dim('}')}`);
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  for (const info of ALL_CONFIG_INFO) {
    const typeColor =
      info.type === 'boolean'
        ? 'green'
        : info.type === 'number'
          ? 'yellow'
          : info.type === 'array'
            ? 'magenta'
            : 'cyan';

    console.log(`  ${c('cyan', info.envVar)} ${dim(`(${info.type})`)}`);
    console.log(`    ${info.description}`);
    console.log(`    ${dim('Default:')} ${info.defaultValue}`);
    if (info.example) {
      console.log(`    ${dim('Example:')} ${c(typeColor, info.example)}`);
    }
    console.log();
  }
}
