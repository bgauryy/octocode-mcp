/**
 * Install Prompt Components
 */

import type { IDE, InstallMethod, MCPClient } from '../../types/index.js';
import { c, dim } from '../../utils/colors.js';
import { select, Separator, input } from '../../utils/prompts.js';
import { IDE_INFO, INSTALL_METHOD_INFO } from '../constants.js';
import { getAppContext } from '../../utils/context.js';
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
  value: MCPClient | 'back';
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
 * Select MCP client prompt with smart detection and status indicators
 */
export async function selectMCPClient(): Promise<{
  client: MCPClient;
  customPath?: string;
} | null> {
  const currentClient = detectCurrentClient();
  const choices: ClientChoice[] = [];

  // Get status for each client
  const clientOrder: MCPClient[] = [
    'cursor',
    'claude-desktop',
    'claude-code',
    'windsurf',
    'trae',
    'antigravity',
    'zed',
    'vscode-cline',
    'vscode-roo',
    'vscode-continue',
  ];

  // Build choices with status indicators
  for (const clientId of clientOrder) {
    const client = MCP_CLIENTS[clientId];
    const status = getClientInstallStatus(clientId);
    const statusIndicator = getClientStatusIndicator(status);
    const isAvailable = clientConfigExists(clientId);

    let name = `${client.name} - ${dim(client.description)}`;

    // Add status indicator
    name += ` ${statusIndicator}`;

    // Highlight if it matches current environment
    if (currentClient === clientId) {
      name = `${c('green', '★')} ${name} ${c('yellow', '(Current)')}`;
    }

    choices.push({
      name,
      value: clientId,
      disabled: !isAvailable ? 'Not installed' : undefined,
    });
  }

  // Sort: current first, then installed, then available, then unavailable
  choices.sort((a, b) => {
    if (a.disabled && !b.disabled) return 1;
    if (!a.disabled && b.disabled) return -1;

    const aStatus = getClientInstallStatus(a.value as MCPClient);
    const bStatus = getClientInstallStatus(b.value as MCPClient);

    // Current environment first
    if (currentClient === a.value) return -1;
    if (currentClient === b.value) return 1;

    // Installed clients next
    if (aStatus.octocodeInstalled && !bStatus.octocodeInstalled) return -1;
    if (!aStatus.octocodeInstalled && bStatus.octocodeInstalled) return 1;

    return 0;
  });

  // Add separator and custom option
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
    message: 'Select MCP client to configure:',
    choices: choices as Array<{ name: string; value: MCPClient | 'back' }>,
    loop: false,
  });

  if (selected === 'back') return null;

  // If custom, prompt for path
  if (selected === 'custom') {
    const customPath = await promptCustomPath();
    if (!customPath) return null;
    return { client: 'custom', customPath };
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
    `    ${dim('•')} ~/.codeium/windsurf/mcp_config.json ${dim('(Windsurf)')}`
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
// Legacy IDE Selection (for backward compatibility)
// ============================================================================

/**
 * Select IDE prompt (legacy)
 * @deprecated Use selectMCPClient instead
 */
export async function selectIDE(availableIDEs: IDE[]): Promise<IDE | null> {
  const ctx = getAppContext();
  const currentIde = ctx.ide.toLowerCase(); // 'cursor' | 'vs code' ...

  const choices = availableIDEs.map(ide => {
    let name = `${IDE_INFO[ide].name} - ${dim(IDE_INFO[ide].description)}`;

    // Highlight if it matches current environment
    if (currentIde.includes(ide)) {
      name = `${c('green', '★')} ${name} ${c('green', '(Current)')}`;
    }

    return {
      name,
      value: ide,
    };
  });

  // Sort to put current IDE first
  choices.sort((a, b) => {
    const aCurrent = a.name.includes('(Current)');
    const bCurrent = b.name.includes('(Current)');
    if (aCurrent && !bCurrent) return -1;
    if (!aCurrent && bCurrent) return 1;
    return 0;
  });

  choices.push(new Separator() as unknown as (typeof choices)[0]);
  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back' as unknown as IDE,
  });

  const selected = await select<IDE | 'back'>({
    message: 'Select IDE to configure:',
    choices: choices as Array<{ name: string; value: IDE | 'back' }>,
  });

  if (selected === 'back') return null;
  return selected;
}

/**
 * Select install method prompt
 */
export async function selectInstallMethod(): Promise<InstallMethod | null> {
  const selected = await select<InstallMethod | 'back'>({
    message: 'Select installation method:',
    choices: [
      {
        name: `${INSTALL_METHOD_INFO.npx.name} - ${dim(INSTALL_METHOD_INFO.npx.description)}`,
        value: 'npx' as const,
        description: INSTALL_METHOD_INFO.npx.pros.join(', '),
      },
      {
        name: `${INSTALL_METHOD_INFO.direct.name} - ${dim(INSTALL_METHOD_INFO.direct.description)}`,
        value: 'direct' as const,
        description: INSTALL_METHOD_INFO.direct.pros.join(', '),
      },
      { type: 'separator', separator: '' } as unknown as {
        name: string;
        value: 'back';
      },
      {
        name: `${c('dim', '← Back')}`,
        value: 'back' as const,
      },
    ],
  });

  if (selected === 'back') return null;
  return selected;
}

/**
 * Confirm override prompt
 */
export async function confirmOverride(
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
