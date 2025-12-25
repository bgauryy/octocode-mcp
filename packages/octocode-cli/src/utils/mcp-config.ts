/**
 * MCP Configuration Utilities
 */

import type {
  MCPConfig,
  MCPServer,
  InstallMethod,
  MCPClient,
} from '../types/index.js';
import { isWindows } from './platform.js';

// Re-exports for backward compatibility
export {
  getMCPConfigPath,
  ideConfigExists,
  clientConfigExists,
  configFileExists,
  detectCurrentClient,
  detectAvailableClients,
  MCP_CLIENTS,
} from './mcp-paths.js';
export { readMCPConfig, writeMCPConfig } from './mcp-io.js';

/**
 * Get octocode MCP server configuration for a given install method
 */
export function getOctocodeServerConfig(method: InstallMethod): MCPServer {
  switch (method) {
    case 'direct':
      return {
        command: 'bash',
        args: [
          '-c',
          'curl -sL https://octocodeai.com/octocode/latest/index.js -o /tmp/index.js && node /tmp/index.js',
        ],
      };

    case 'npx':
      return {
        command: 'npx',
        args: ['octocode-mcp@latest'],
      };

    default:
      throw new Error(`Unknown install method: ${method}`);
  }
}

/**
 * Get Windows-compatible octocode config for direct method
 */
export function getOctocodeServerConfigWindows(
  method: InstallMethod
): MCPServer {
  if (method === 'direct') {
    // Windows doesn't have bash/curl by default, use PowerShell
    return {
      command: 'powershell',
      args: [
        '-Command',
        "Invoke-WebRequest -Uri 'https://octocodeai.com/octocode/latest/index.js' -OutFile $env:TEMP\\index.js; node $env:TEMP\\index.js",
      ],
    };
  }
  // npx works the same on Windows
  return getOctocodeServerConfig(method);
}

/**
 * Add or update octocode in MCP config
 */
export function mergeOctocodeConfig(
  config: MCPConfig,
  method: InstallMethod
): MCPConfig {
  const serverConfig = isWindows
    ? getOctocodeServerConfigWindows(method)
    : getOctocodeServerConfig(method);

  return {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      octocode: serverConfig,
    },
  };
}

/**
 * Check if octocode is already configured
 */
export function isOctocodeConfigured(config: MCPConfig): boolean {
  return Boolean(config.mcpServers?.octocode);
}

/**
 * Get currently configured octocode method
 */
export function getConfiguredMethod(config: MCPConfig): InstallMethod | null {
  const octocode = config.mcpServers?.octocode;
  if (!octocode) return null;

  if (octocode.command === 'npx') return 'npx';
  if (octocode.command === 'bash' || octocode.command === 'powershell') {
    return 'direct';
  }
  return null;
}

// ============================================================================
// Client Installation Status
// ============================================================================

import { getMCPConfigPath, configFileExists } from './mcp-paths.js';
import { readMCPConfig } from './mcp-io.js';

export interface ClientInstallStatus {
  client: MCPClient;
  configExists: boolean;
  octocodeInstalled: boolean;
  method: InstallMethod | null;
  configPath: string;
}

/**
 * Check if octocode is installed for a specific client
 */
export function getClientInstallStatus(
  client: MCPClient,
  customPath?: string
): ClientInstallStatus {
  const configPath = getMCPConfigPath(client, customPath);
  const configExists = configFileExists(client, customPath);

  let octocodeInstalled = false;
  let method: InstallMethod | null = null;

  if (configExists) {
    const config = readMCPConfig(configPath);
    if (config) {
      octocodeInstalled = isOctocodeConfigured(config);
      method = getConfiguredMethod(config);
    }
  }

  return {
    client,
    configExists,
    octocodeInstalled,
    method,
    configPath,
  };
}

/**
 * Get installation status for all available clients
 */
export function getAllClientInstallStatus(): ClientInstallStatus[] {
  const clients: MCPClient[] = [
    'cursor',
    'claude-desktop',
    'claude-code',
    'vscode-cline',
    'vscode-roo',
    'vscode-continue',
    'windsurf',
    'zed',
  ];

  return clients.map(client => getClientInstallStatus(client));
}

/**
 * Find clients that already have octocode installed
 */
export function findInstalledClients(): ClientInstallStatus[] {
  return getAllClientInstallStatus().filter(status => status.octocodeInstalled);
}
