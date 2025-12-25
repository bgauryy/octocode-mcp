/**
 * MCP Config Path Resolution
 *
 * Supports multiple MCP clients with cross-platform paths:
 * - Cursor IDE
 * - Claude Desktop
 * - Claude Code CLI
 * - VS Code Cline extension
 * - VS Code Roo-Cline extension
 * - Windsurf IDE
 * - Custom paths
 */

import path from 'node:path';
import type {
  MCPClient,
  MCPClientInfo,
  MCPClientCategory,
} from '../types/index.js';
import { isWindows, isMac, HOME, getAppDataPath } from './platform.js';
import { dirExists, fileExists } from './fs.js';

// ============================================================================
// Platform-specific base paths
// ============================================================================

/**
 * Get the base application support directory for the current platform
 */
function getAppSupportDir(): string {
  if (isWindows) {
    return getAppDataPath();
  }
  if (isMac) {
    return path.join(HOME, 'Library', 'Application Support');
  }
  // Linux
  return process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');
}

/**
 * Get the VS Code extensions globalStorage path
 */
function getVSCodeGlobalStoragePath(): string {
  const appSupport = getAppSupportDir();
  if (isWindows) {
    return path.join(appSupport, 'Code', 'User', 'globalStorage');
  }
  if (isMac) {
    return path.join(appSupport, 'Code', 'User', 'globalStorage');
  }
  // Linux
  return path.join(appSupport, 'Code', 'User', 'globalStorage');
}

// ============================================================================
// MCP Client Metadata
// ============================================================================

/**
 * Comprehensive MCP client information
 */
export const MCP_CLIENTS: Record<MCPClient, MCPClientInfo> = {
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-first code editor',
    category: 'ide',
    url: 'https://cursor.sh',
    envVars: ['CURSOR_AGENT', 'CURSOR_TRACE_ID', 'CURSOR_SESSION_ID', 'CURSOR'],
  },
  'claude-desktop': {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    description: "Anthropic's desktop app",
    category: 'desktop',
    url: 'https://claude.ai/download',
  },
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Claude CLI for terminal',
    category: 'cli',
    url: 'https://docs.anthropic.com/claude-code',
    envVars: ['CLAUDE_CODE'],
  },
  'vscode-cline': {
    id: 'vscode-cline',
    name: 'Cline (VS Code)',
    description: 'AI coding assistant extension',
    category: 'extension',
    url: 'https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev',
    envVars: ['VSCODE_PID', 'TERM_PROGRAM'],
  },
  'vscode-roo': {
    id: 'vscode-roo',
    name: 'Roo-Cline (VS Code)',
    description: 'Roo AI coding extension',
    category: 'extension',
    envVars: ['VSCODE_PID'],
  },
  windsurf: {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Codeium AI IDE',
    category: 'ide',
    url: 'https://codeium.com/windsurf',
    envVars: ['WINDSURF_SESSION'],
  },
  trae: {
    id: 'trae',
    name: 'Trae',
    description: 'Adaptive AI IDE',
    category: 'ide',
    url: 'https://trae.ai',
  },
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity',
    description: 'Gemini-powered AI IDE',
    category: 'ide',
  },
  'vscode-continue': {
    id: 'vscode-continue',
    name: 'Continue (VS Code)',
    description: 'Open-source AI assistant',
    category: 'extension',
    url: 'https://continue.dev',
    envVars: ['VSCODE_PID'],
  },
  zed: {
    id: 'zed',
    name: 'Zed',
    description: 'High-performance code editor',
    category: 'ide',
    url: 'https://zed.dev',
    envVars: ['ZED_TERM'],
  },
  custom: {
    id: 'custom',
    name: 'Custom Path',
    description: 'Specify your own MCP config path',
    category: 'cli',
  },
};

// ============================================================================
// MCP Config Path Resolution
// ============================================================================

/**
 * Get MCP config file path for a given client
 */
export function getMCPConfigPath(
  client: MCPClient,
  customPath?: string
): string {
  if (client === 'custom' && customPath) {
    return customPath;
  }

  const appSupport = getAppSupportDir();
  const vsCodeStorage = getVSCodeGlobalStoragePath();

  switch (client) {
    case 'cursor':
      if (isWindows) {
        return path.join(getAppDataPath(), 'Cursor', 'mcp.json');
      }
      return path.join(HOME, '.cursor', 'mcp.json');

    case 'claude-desktop':
      if (isWindows) {
        return path.join(appSupport, 'Claude', 'claude_desktop_config.json');
      }
      if (isMac) {
        return path.join(appSupport, 'Claude', 'claude_desktop_config.json');
      }
      // Linux
      return path.join(appSupport, 'claude', 'claude_desktop_config.json');

    case 'claude-code':
      return path.join(HOME, '.claude.json');

    case 'vscode-cline':
      return path.join(
        vsCodeStorage,
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json'
      );

    case 'vscode-roo':
      return path.join(
        vsCodeStorage,
        'rooveterinaryinc.roo-cline',
        'settings',
        'cline_mcp_settings.json'
      );

    case 'windsurf':
      return path.join(HOME, '.codeium', 'windsurf', 'mcp_config.json');

    case 'trae':
      if (isWindows) {
        return path.join(getAppDataPath(), 'Trae', 'mcp.json');
      }
      if (isMac) {
        return path.join(appSupport, 'Trae', 'mcp.json');
      }
      // Linux
      return path.join(appSupport, 'Trae', 'mcp.json');

    case 'antigravity':
      return path.join(HOME, '.gemini', 'antigravity', 'mcp_config.json');

    case 'vscode-continue':
      // Continue uses ~/.continue/config.json
      return path.join(HOME, '.continue', 'config.json');

    case 'zed':
      // Zed uses ~/.config/zed/settings.json on macOS/Linux
      if (isWindows) {
        return path.join(getAppDataPath(), 'Zed', 'settings.json');
      }
      if (isMac) {
        return path.join(HOME, '.config', 'zed', 'settings.json');
      }
      // Linux
      return path.join(appSupport, 'zed', 'settings.json');

    case 'custom':
      throw new Error('Custom path requires customPath parameter');

    default:
      throw new Error(`Unknown MCP client: ${client}`);
  }
}

/**
 * Check if an MCP client's config directory exists
 */
export function clientConfigExists(
  client: MCPClient,
  customPath?: string
): boolean {
  try {
    const configPath = getMCPConfigPath(client, customPath);
    const configDir = path.dirname(configPath);
    return dirExists(configDir);
  } catch {
    return false;
  }
}

/**
 * Check if an MCP config file exists
 */
export function configFileExists(
  client: MCPClient,
  customPath?: string
): boolean {
  try {
    const configPath = getMCPConfigPath(client, customPath);
    return fileExists(configPath);
  } catch {
    return false;
  }
}

// ============================================================================
// IDE Detection
// ============================================================================

/**
 * Detect which MCP client we're running inside based on environment variables
 */
export function detectCurrentClient(): MCPClient | null {
  const env = process.env;

  // Check Cursor first (most specific)
  if (
    env.CURSOR_AGENT ||
    env.CURSOR_TRACE_ID ||
    env.CURSOR_SESSION_ID ||
    env.CURSOR
  ) {
    return 'cursor';
  }

  // Check Windsurf
  if (env.WINDSURF_SESSION) {
    return 'windsurf';
  }

  // Check Claude Code
  if (env.CLAUDE_CODE) {
    return 'claude-code';
  }

  // Check Zed
  if (env.ZED_TERM || env.ZED) {
    return 'zed';
  }

  // Check VS Code (could be Cline, Roo, or Continue)
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') {
    // Default to Cline as it's more common
    return 'vscode-cline';
  }

  return null;
}

/**
 * Detect all available/installed MCP clients
 */
export function detectAvailableClients(): MCPClient[] {
  const available: MCPClient[] = [];

  const clients: MCPClient[] = [
    'cursor',
    'claude-desktop',
    'claude-code',
    'vscode-cline',
    'vscode-roo',
    'vscode-continue',
    'windsurf',
    'trae',
    'antigravity',
    'zed',
  ];

  for (const client of clients) {
    if (clientConfigExists(client)) {
      available.push(client);
    }
  }

  return available;
}

/**
 * Get clients grouped by category
 */
export function getClientsByCategory(): Record<
  MCPClientCategory,
  MCPClientInfo[]
> {
  const grouped: Record<MCPClientCategory, MCPClientInfo[]> = {
    ide: [],
    desktop: [],
    extension: [],
    cli: [],
  };

  for (const client of Object.values(MCP_CLIENTS)) {
    if (client.id !== 'custom') {
      grouped[client.category].push(client);
    }
  }

  return grouped;
}

// ============================================================================
// Legacy compatibility (for IDE type)
// ============================================================================

import type { IDE } from '../types/index.js';

/**
 * Legacy function for backward compatibility
 * @deprecated Use getMCPConfigPath with MCPClient instead
 */
export function getIDEConfigPath(ide: IDE): string {
  const clientMap: Record<IDE, MCPClient> = {
    cursor: 'cursor',
    claude: 'claude-desktop',
  };
  return getMCPConfigPath(clientMap[ide]);
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use clientConfigExists with MCPClient instead
 */
export function ideConfigExists(ide: IDE): boolean {
  const clientMap: Record<IDE, MCPClient> = {
    cursor: 'cursor',
    claude: 'claude-desktop',
  };
  return clientConfigExists(clientMap[ide]);
}
