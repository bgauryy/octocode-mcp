/**
 * Install Prompt Components
 */

import type { MCPClient } from '../../types/index.js';
import { c, dim, bold } from '../../utils/colors.js';
import { select, Separator, input } from '../../utils/prompts.js';
import {
  MCP_CLIENTS,
  detectCurrentClient,
  clientConfigExists,
} from '../../utils/mcp-paths.js';
import {
  getClientInstallStatus,
  type ClientInstallStatus,
} from '../../utils/mcp-config.js';
import { dirExists } from '../../utils/fs.js';
import path from 'node:path';

// ============================================================================
// MCP Client Selection (New)
// ============================================================================

interface ClientChoice {
  name: string;
  value: MCPClient | 'back' | 'install-new';
  disabled?: boolean | string;
}

/**
 * Build status indicator for a client
 */
function getClientStatusIndicator(status: ClientInstallStatus): string {
  if (status.octocodeInstalled) {
    return c('green', '✓ Installed');
  }
  if (status.configExists) {
    return c('blue', '○ Ready');
  }
  if (clientConfigExists(status.client)) {
    return c('dim', '○ Available');
  }
  return c('dim', '○ Not found');
}

/**
 * Get list of all clients with their install status
 */
function getAllClientsWithStatus(): Array<{
  clientId: MCPClient;
  status: ClientInstallStatus;
  isAvailable: boolean;
}> {
  const clientOrder: MCPClient[] = [
    'cursor',
    'claude-desktop',
    'claude-code',
    'opencode',
    'windsurf',
    'trae',
    'antigravity',
    'zed',
    'vscode-cline',
    'vscode-roo',
    'vscode-continue',
  ];

  return clientOrder.map(clientId => ({
    clientId,
    status: getClientInstallStatus(clientId),
    isAvailable: clientConfigExists(clientId),
  }));
}

/**
 * Select MCP client prompt with smart detection and status indicators
 * Provides intuitive UX:
 * - If no octocode configs exist: Shows message and option to install or go back
 * - If configs exist: Shows only installed clients for editing, plus option to install new
 */
export async function selectMCPClient(): Promise<{
  client: MCPClient;
  customPath?: string;
} | null> {
  const currentClient = detectCurrentClient();
  const allClients = getAllClientsWithStatus();

  // Find clients with octocode installed
  const installedClients = allClients.filter(c => c.status.octocodeInstalled);
  const availableClients = allClients.filter(
    c => c.isAvailable && !c.status.octocodeInstalled
  );

  // If NO octocode configurations found
  if (installedClients.length === 0) {
    return await promptNoConfigurationsFound(availableClients, currentClient);
  }

  // If configurations exist, show installed clients for editing
  return await promptExistingConfigurations(
    installedClients,
    availableClients,
    currentClient
  );
}

/**
 * Show prompt when no octocode configurations are found
 */
async function promptNoConfigurationsFound(
  availableClients: Array<{
    clientId: MCPClient;
    status: ClientInstallStatus;
    isAvailable: boolean;
  }>,
  currentClient: MCPClient | null
): Promise<{ client: MCPClient; customPath?: string } | null> {
  console.log();
  console.log(c('yellow', '  ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('yellow', '  │ ') +
      `${c('yellow', 'ℹ')} No octocode configurations found` +
      ' '.repeat(24) +
      c('yellow', '│')
  );
  console.log(c('yellow', '  └' + '─'.repeat(60) + '┘'));
  console.log();
  console.log(`  ${dim('Octocode is not configured in any MCP client yet.')}`);
  console.log();

  if (availableClients.length === 0) {
    console.log(
      `  ${c('red', '✗')} ${dim('No MCP clients detected on this system.')}`
    );
    console.log();
    console.log(`  ${dim('Supported clients:')}`);
    console.log(`    ${dim('• Cursor, Claude Desktop, Claude Code')}`);
    console.log(`    ${dim('• Windsurf, Zed, VS Code (Cline/Roo/Continue)')}`);
    console.log();
    console.log(`  ${dim('Install a supported client and try again,')}`);
    console.log(`  ${dim('or use "Custom Path" to specify a config file.')}`);
    console.log();

    const choices: ClientChoice[] = [
      {
        name: `${c('cyan', '⚙')} Custom Path - ${dim('Specify your own MCP config path')}`,
        value: 'custom' as MCPClient,
      },
      new Separator() as unknown as ClientChoice,
      {
        name: `${c('dim', '← Back')}`,
        value: 'back',
      },
    ];

    const selected = await select<MCPClient | 'back'>({
      message: 'What would you like to do?',
      choices: choices as Array<{ name: string; value: MCPClient | 'back' }>,
      loop: false,
    });

    if (selected === 'back') return null;

    if (selected === 'custom') {
      const customPath = await promptCustomPath();
      if (!customPath) return null;
      return { client: 'custom', customPath };
    }

    return null;
  }

  // Show available clients for fresh installation
  const choices: ClientChoice[] = [];

  for (const { clientId, status } of availableClients) {
    const client = MCP_CLIENTS[clientId];
    let name = `${client.name} - ${dim(client.description)}`;

    // Add status indicator
    name += ` ${getClientStatusIndicator(status)}`;

    // Highlight current environment
    if (currentClient === clientId) {
      name = `${c('green', '★')} ${name} ${c('yellow', '(Current)')}`;
    }

    choices.push({
      name,
      value: clientId,
    });
  }

  // Sort: current first
  choices.sort((a, b) => {
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    return 0;
  });

  // Add separator and options
  choices.push(new Separator() as unknown as ClientChoice);
  choices.push({
    name: `${c('cyan', '⚙')} Custom Path - ${dim('Specify your own MCP config path')}`,
    value: 'custom' as MCPClient,
  });
  choices.push(new Separator() as unknown as ClientChoice);
  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const selected = await select<MCPClient | 'back'>({
    message: 'Select a client to install Octocode:',
    choices: choices as Array<{ name: string; value: MCPClient | 'back' }>,
    loop: false,
  });

  if (selected === 'back') return null;

  if (selected === 'custom') {
    const customPath = await promptCustomPath();
    if (!customPath) return null;
    return { client: 'custom', customPath };
  }

  return { client: selected };
}

/**
 * Show prompt when octocode configurations exist - for viewing/editing
 */
async function promptExistingConfigurations(
  installedClients: Array<{
    clientId: MCPClient;
    status: ClientInstallStatus;
    isAvailable: boolean;
  }>,
  availableClients: Array<{
    clientId: MCPClient;
    status: ClientInstallStatus;
    isAvailable: boolean;
  }>,
  currentClient: MCPClient | null
): Promise<{ client: MCPClient; customPath?: string } | null> {
  console.log();
  console.log(
    `  ${c('green', '✓')} Found ${bold(String(installedClients.length))} octocode configuration${installedClients.length > 1 ? 's' : ''}`
  );
  console.log();

  const choices: ClientChoice[] = [];

  // Show installed clients first (for editing)
  for (const { clientId } of installedClients) {
    const client = MCP_CLIENTS[clientId];
    let name = `${c('green', '✓')} ${client.name} - ${dim('View/Edit configuration')}`;

    // Highlight current environment
    if (currentClient === clientId) {
      name += ` ${c('yellow', '(Current)')}`;
    }

    choices.push({
      name,
      value: clientId,
    });
  }

  // Sort installed: current first
  choices.sort((a, b) => {
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    return 0;
  });

  // Add option to install to new client if there are available clients
  if (availableClients.length > 0) {
    choices.push(new Separator() as unknown as ClientChoice);
    choices.push({
      name: `${c('blue', '+')} Install to another client - ${dim(`${availableClients.length} available`)}`,
      value: 'install-new',
    });
  }

  // Add custom and back options
  choices.push(new Separator() as unknown as ClientChoice);
  choices.push({
    name: `${c('cyan', '⚙')} Custom Path - ${dim('Specify your own MCP config path')}`,
    value: 'custom' as MCPClient,
  });
  choices.push(new Separator() as unknown as ClientChoice);
  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const selected = await select<MCPClient | 'back' | 'install-new'>({
    message: 'Select configuration to manage:',
    choices: choices as Array<{
      name: string;
      value: MCPClient | 'back' | 'install-new';
    }>,
    loop: false,
  });

  if (selected === 'back') return null;

  // If user wants to install to a new client
  if (selected === 'install-new') {
    return await promptInstallToNewClient(availableClients, currentClient);
  }

  if (selected === 'custom') {
    const customPath = await promptCustomPath();
    if (!customPath) return null;
    return { client: 'custom', customPath };
  }

  return { client: selected };
}

/**
 * Show prompt for installing to a new client (when user already has some configs)
 */
async function promptInstallToNewClient(
  availableClients: Array<{
    clientId: MCPClient;
    status: ClientInstallStatus;
    isAvailable: boolean;
  }>,
  currentClient: MCPClient | null
): Promise<{ client: MCPClient; customPath?: string } | null> {
  console.log();
  console.log(`  ${c('blue', 'ℹ')} Select a client for new installation:`);
  console.log();

  const choices: ClientChoice[] = [];

  for (const { clientId, status } of availableClients) {
    const client = MCP_CLIENTS[clientId];
    let name = `${client.name} - ${dim(client.description)}`;

    // Add status indicator
    name += ` ${getClientStatusIndicator(status)}`;

    // Highlight current environment
    if (currentClient === clientId) {
      name = `${c('green', '★')} ${name} ${c('yellow', '(Current)')}`;
    }

    choices.push({
      name,
      value: clientId,
    });
  }

  // Sort: current first
  choices.sort((a, b) => {
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;
    return 0;
  });

  // Add back option
  choices.push(new Separator() as unknown as ClientChoice);
  choices.push({
    name: `${c('dim', '← Back to configurations')}`,
    value: 'back',
  });

  const selected = await select<MCPClient | 'back'>({
    message: 'Select client to install Octocode:',
    choices: choices as Array<{ name: string; value: MCPClient | 'back' }>,
    loop: false,
  });

  if (selected === 'back') {
    // Go back to existing configurations menu
    const allClients = getAllClientsWithStatus();
    const installedClients = allClients.filter(c => c.status.octocodeInstalled);
    return await promptExistingConfigurations(
      installedClients,
      availableClients,
      currentClient
    );
  }

  return { client: selected };
}

/**
 * Expand ~ to home directory in paths
 */
function expandPath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(process.env.HOME || '', inputPath.slice(1));
  }
  return inputPath;
}

/**
 * Prompt for custom MCP config path with validation
 */
async function promptCustomPath(): Promise<string | null> {
  console.log();
  console.log(
    `  ${c('blue', 'ℹ')} Enter the full path to your MCP config file (JSON)`
  );
  console.log(`  ${dim('Leave empty to go back')}`);
  console.log();
  console.log(`  ${dim('Common paths:')}`);
  console.log(`    ${dim('•')} ~/.cursor/mcp.json ${dim('(Cursor)')}`);
  console.log(
    `    ${dim('•')} ~/Library/Application Support/Claude/claude_desktop_config.json`
  );
  console.log(`      ${dim('(Claude Desktop)')}`);
  console.log(`    ${dim('•')} ~/.claude.json ${dim('(Claude Code)')}`);
  console.log(
    `    ${dim('•')} ~/.config/opencode/config.json ${dim('(Opencode)')}`
  );
  console.log(
    `    ${dim('•')} ~/.codeium/windsurf/mcp_config.json ${dim('(Windsurf)')}`
  );
  console.log(
    `    ${dim('•')} ~/Library/Application Support/Trae/mcp.json ${dim('(Trae)')}`
  );
  console.log(
    `    ${dim('•')} ~/.gemini/antigravity/mcp_config.json ${dim('(Antigravity)')}`
  );
  console.log(`    ${dim('•')} ~/.config/zed/settings.json ${dim('(Zed)')}`);
  console.log(`    ${dim('•')} ~/.continue/config.json ${dim('(Continue)')}`);
  console.log();

  const customPath = await input({
    message: 'MCP config path (or press Enter to go back):',
    validate: (value: string) => {
      // Allow empty to go back
      if (!value.trim()) {
        return true;
      }

      const expandedPath = expandPath(value);

      // Check if it's a JSON file
      if (!expandedPath.endsWith('.json')) {
        return 'Path must be a .json file (e.g., mcp.json, config.json)';
      }

      // Check if path is absolute (after expansion)
      if (!path.isAbsolute(expandedPath)) {
        return 'Please provide an absolute path (starting with / or ~)';
      }

      // Check if parent directory exists
      const parentDir = path.dirname(expandedPath);
      if (!dirExists(parentDir)) {
        return `Parent directory does not exist: ${parentDir}\nCreate it first or choose a different location.`;
      }

      return true;
    },
  });

  // Empty input means go back
  if (!customPath || !customPath.trim()) return null;

  return expandPath(customPath);
}

// ============================================================================
// Environment Configuration Prompts
// ============================================================================

interface _EnvConfig {
  enableLocal?: boolean;
  githubToken?: string;
}

type LocalToolsChoice = 'enable' | 'disable' | 'back';

/**
 * Prompt for local tools enablement
 * Returns: true (enable), false (disable), or null (back)
 */
export async function promptLocalTools(): Promise<boolean | null> {
  console.log();
  console.log(`  ${c('blue', 'ℹ')} ${bold('Local Tools')}`);
  console.log(
    `  ${dim('Enable local filesystem tools for searching and reading files')}`
  );
  console.log(`  ${dim('in your local codebase.')}`);
  console.log();

  const choice = await select<LocalToolsChoice>({
    message: 'Enable local tools?',
    choices: [
      {
        name: `${c('yellow', '○')} Disable ${dim('(Recommended)')} - ${dim('Use only GitHub tools')}`,
        value: 'disable' as const,
      },
      {
        name: `${c('green', '●')} Enable - ${dim('Allow local file exploration')}`,
        value: 'enable' as const,
      },
      new Separator() as unknown as { name: string; value: LocalToolsChoice },
      {
        name: `${c('dim', '← Back')}`,
        value: 'back' as const,
      },
    ],
    loop: false,
  });

  if (choice === 'back') return null;
  return choice === 'enable';
}

type GitHubAuthMethod = 'gh-cli' | 'token' | 'skip' | 'back';

/**
 * Prompt for GitHub authentication method
 * Returns null if user chooses to go back
 */
export async function promptGitHubAuth(): Promise<{
  method: Exclude<GitHubAuthMethod, 'back'>;
  token?: string;
} | null> {
  console.log();
  console.log(`  ${c('blue', 'ℹ')} ${bold('GitHub Authentication')}`);
  console.log(`  ${dim('Required for accessing GitHub repositories.')}`);
  console.log();

  const method = await select<GitHubAuthMethod>({
    message: 'How would you like to authenticate with GitHub?',
    choices: [
      {
        name: `${c('green', '●')} gh CLI ${dim('(Recommended)')} - ${dim('Uses existing gh auth')}`,
        value: 'gh-cli' as const,
      },
      {
        name: `${c('yellow', '●')} GITHUB_TOKEN - ${dim('Enter personal access token')}`,
        value: 'token' as const,
      },
      {
        name: `${c('dim', '○')} Skip - ${dim('Configure manually later')}`,
        value: 'skip' as const,
      },
      new Separator() as unknown as { name: string; value: GitHubAuthMethod },
      {
        name: `${c('dim', '← Back')}`,
        value: 'back' as const,
      },
    ],
    loop: false,
  });

  if (method === 'back') return null;

  if (method === 'gh-cli') {
    console.log();
    console.log(
      `  ${c('cyan', '→')} Make sure gh CLI is installed and authenticated:`
    );
    console.log(`    ${dim('https://cli.github.com/')}`);
    console.log();
    console.log(
      `  ${dim('Run')} ${c('cyan', 'gh auth login')} ${dim('if not already authenticated.')}`
    );
    console.log();
    return { method: 'gh-cli' };
  }

  if (method === 'token') {
    console.log();
    console.log(`  ${dim('Leave empty and press Enter to go back')}`);
    console.log();

    const token = await input({
      message: 'Enter your GitHub personal access token:',
      validate: (value: string) => {
        // Allow empty to go back
        if (!value.trim()) {
          return true;
        }
        if (value.length < 20) {
          return 'Token appears too short';
        }
        return true;
      },
    });

    // Empty input means go back
    if (!token || !token.trim()) {
      return null;
    }

    console.log();
    console.log(`  ${c('yellow', '⚠')} ${bold('Security Note:')}`);
    console.log(
      `  ${dim('Your token will be saved in the MCP configuration file.')}`
    );
    console.log(
      `  ${dim('Make sure this file is not committed to version control.')}`
    );
    console.log();

    return { method: 'token', token };
  }

  return { method: 'skip' };
}

/**
 * Confirm override prompt
 */
async function _confirmOverride(
  clientName: string,
  existingMethod: string | null
): Promise<boolean> {
  const { confirm } = await import('../../utils/prompts.js');

  console.log();
  console.log(c('yellow', '  ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('yellow', '  │ ') +
      `${c('yellow', '⚠')} Octocode is already configured in ${clientName}!` +
      ' '.repeat(Math.max(0, 60 - 42 - clientName.length)) +
      c('yellow', '│')
  );
  if (existingMethod) {
    console.log(
      c('yellow', '  │ ') +
        `Current method: ${existingMethod}` +
        ' '.repeat(Math.max(0, 60 - 17 - existingMethod.length)) +
        c('yellow', '│')
    );
  }
  console.log(c('yellow', '  └' + '─'.repeat(60) + '┘'));
  console.log();

  return await confirm({
    message: 'Override existing configuration?',
    default: false,
  });
}
