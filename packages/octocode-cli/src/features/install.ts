/**
 * Installation Feature
 */

import type {
  IDE,
  InstallMethod,
  MCPConfig,
  MCPServer,
  MCPClient,
} from '../types/index.js';
import {
  getMCPConfigPath,
  readMCPConfig,
  writeMCPConfig,
  mergeOctocodeConfig,
  isOctocodeConfigured,
  clientConfigExists,
  getOctocodeServerConfig,
  getOctocodeServerConfigWindows,
  getConfiguredMethod,
} from '../utils/mcp-config.js';
import { fileExists } from '../utils/fs.js';
import { isWindows } from '../utils/platform.js';

/**
 * Convert legacy IDE type to MCPClient
 */
function ideToMCPClient(ide: IDE): MCPClient {
  if (ide === 'claude') {
    return 'claude-desktop';
  }
  return ide;
}

export interface InstallOptions {
  ide: IDE;
  method: InstallMethod;
  force?: boolean;
}

export interface InstallResult {
  success: boolean;
  configPath: string;
  backupPath?: string;
  alreadyInstalled?: boolean;
  error?: string;
}

export interface InstallPreview {
  ide: IDE;
  method: InstallMethod;
  configPath: string;
  serverConfig: MCPServer;
  action: 'create' | 'add' | 'override';
  existingMethod?: InstallMethod | null;
}

/**
 * Detect which IDEs are available on the system
 */
export function detectAvailableIDEs(): IDE[] {
  const available: IDE[] = [];

  if (clientConfigExists('cursor')) {
    available.push('cursor');
  }
  if (clientConfigExists('claude-desktop')) {
    available.push('claude');
  }

  return available;
}

/**
 * Check if octocode is already installed for an IDE
 */
export function checkExistingInstallation(ide: IDE): {
  installed: boolean;
  configPath: string;
  configExists: boolean;
} {
  const configPath = getMCPConfigPath(ideToMCPClient(ide));
  const configExists = fileExists(configPath);

  if (!configExists) {
    return { installed: false, configPath, configExists: false };
  }

  const config = readMCPConfig(configPath);
  if (!config) {
    return { installed: false, configPath, configExists: true };
  }

  return {
    installed: isOctocodeConfigured(config),
    configPath,
    configExists: true,
  };
}

/**
 * Install octocode MCP for an IDE
 */
export function installOctocode(options: InstallOptions): InstallResult {
  const { ide, method, force = false } = options;
  const configPath = getMCPConfigPath(ideToMCPClient(ide));

  // Read existing config or create new
  let config: MCPConfig = readMCPConfig(configPath) || { mcpServers: {} };

  // Check if already installed
  if (isOctocodeConfigured(config) && !force) {
    return {
      success: false,
      configPath,
      alreadyInstalled: true,
      error: 'Octocode is already configured. Use --force to overwrite.',
    };
  }

  // Merge octocode config
  config = mergeOctocodeConfig(config, method);

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
 * Install octocode for multiple IDEs
 */
export function installOctocodeMultiple(
  ides: IDE[],
  method: InstallMethod,
  force: boolean = false
): Map<IDE, InstallResult> {
  const results = new Map<IDE, InstallResult>();

  for (const ide of ides) {
    results.set(ide, installOctocode({ ide, method, force }));
  }

  return results;
}

/**
 * Get a preview of what the installation will do
 * Shared between CLI and interactive UI
 */
export function getInstallPreview(
  ide: IDE,
  method: InstallMethod
): InstallPreview {
  const configPath = getMCPConfigPath(ideToMCPClient(ide));
  const existing = checkExistingInstallation(ide);
  const existingConfig = readMCPConfig(configPath);
  const serverConfig = isWindows
    ? getOctocodeServerConfigWindows(method)
    : getOctocodeServerConfig(method);

  let action: InstallPreview['action'] = 'create';
  if (existing.installed) {
    action = 'override';
  } else if (existing.configExists) {
    action = 'add';
  }

  return {
    ide,
    method,
    configPath,
    serverConfig,
    action,
    existingMethod: existingConfig ? getConfiguredMethod(existingConfig) : null,
  };
}

// ============================================================================
// MCPClient-based Installation (New API)
// ============================================================================

import type { OctocodeEnvOptions } from '../utils/mcp-config.js';

export interface ClientInstallOptions {
  client: MCPClient;
  method: InstallMethod;
  customPath?: string;
  force?: boolean;
  envOptions?: OctocodeEnvOptions;
}

export interface ClientInstallPreview {
  client: MCPClient;
  method: InstallMethod;
  configPath: string;
  serverConfig: MCPServer;
  action: 'create' | 'add' | 'override';
  existingMethod?: InstallMethod | null;
}

/**
 * Check if octocode is already installed for a client
 */
export function checkExistingClientInstallation(
  client: MCPClient,
  customPath?: string
): {
  installed: boolean;
  configPath: string;
  configExists: boolean;
} {
  const configPath =
    client === 'custom' && customPath
      ? customPath
      : getMCPConfigPath(client, customPath);
  const configExists = fileExists(configPath);

  if (!configExists) {
    return { installed: false, configPath, configExists: false };
  }

  const config = readMCPConfig(configPath);
  if (!config) {
    return { installed: false, configPath, configExists: true };
  }

  return {
    installed: isOctocodeConfigured(config),
    configPath,
    configExists: true,
  };
}

/**
 * Install octocode MCP for a specific client
 */
export function installOctocodeForClient(
  options: ClientInstallOptions
): InstallResult {
  const { client, method, customPath, force = false, envOptions } = options;
  const configPath =
    client === 'custom' && customPath
      ? customPath
      : getMCPConfigPath(client, customPath);

  // Read existing config or create new
  let config: MCPConfig = readMCPConfig(configPath) || { mcpServers: {} };

  // Check if already installed
  if (isOctocodeConfigured(config) && !force) {
    return {
      success: false,
      configPath,
      alreadyInstalled: true,
      error: 'Octocode is already configured. Use --force to overwrite.',
    };
  }

  // Merge octocode config with env options
  config = mergeOctocodeConfig(config, method, envOptions);

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
 * Get a preview of what the installation will do for a client
 */
export function getInstallPreviewForClient(
  client: MCPClient,
  method: InstallMethod,
  customPath?: string,
  envOptions?: OctocodeEnvOptions
): ClientInstallPreview {
  const configPath =
    client === 'custom' && customPath
      ? customPath
      : getMCPConfigPath(client, customPath);
  const existing = checkExistingClientInstallation(client, customPath);
  const existingConfig = readMCPConfig(configPath);
  const serverConfig = isWindows
    ? getOctocodeServerConfigWindows(method, envOptions)
    : getOctocodeServerConfig(method, envOptions);

  let action: ClientInstallPreview['action'] = 'create';
  if (existing.installed) {
    action = 'override';
  } else if (existing.configExists) {
    action = 'add';
  }

  return {
    client,
    method,
    configPath,
    serverConfig,
    action,
    existingMethod: existingConfig ? getConfiguredMethod(existingConfig) : null,
  };
}

/**
 * Detect which clients are available on the system
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
    'zed',
  ];

  for (const client of clients) {
    if (clientConfigExists(client)) {
      available.push(client);
    }
  }

  return available;
}
