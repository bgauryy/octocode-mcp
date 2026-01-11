/**
 * LSP Client lifecycle management
 * Handles client caching, creation, and availability checks
 * @module lsp/manager
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { LSPClient } from './client.js';
import {
  getLanguageServerForFile,
  loadUserConfig,
  resolveLanguageServer,
  LANGUAGE_SERVER_COMMANDS,
} from './config.js';

/**
 * Client cache to reuse connections
 * Key: `${command}:${workspaceRoot}`
 */
const clientCache = new Map<string, LSPClient>();

/**
 * Get or create an LSP client for a workspace and file type.
 * Clients are cached by command and workspace root.
 *
 * @param workspaceRoot - Workspace root directory
 * @param filePath - Path to a source file (used to determine language server)
 * @returns LSP client or null if no server available
 *
 * @example
 * const client = await getOrCreateClient('/path/to/project', '/path/to/project/src/index.ts');
 * if (client) {
 *   const definitions = await client.gotoDefinition(filePath, position);
 * }
 */
export async function getOrCreateClient(
  workspaceRoot: string,
  filePath: string
): Promise<LSPClient | null> {
  const serverConfig = await getLanguageServerForFile(filePath, workspaceRoot);
  if (!serverConfig) {
    return null;
  }

  const cacheKey = `${serverConfig.command}:${workspaceRoot}`;

  let client = clientCache.get(cacheKey);
  if (client) {
    return client;
  }

  client = new LSPClient(serverConfig);

  try {
    await client.start();
    clientCache.set(cacheKey, client);
    return client;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start LSP client:', error);
    return null;
  }
}

/**
 * Check if a command exists in the system PATH.
 * Works cross-platform (Windows, macOS, Linux).
 *
 * @param command - The command name to check (e.g., 'node', 'python')
 * @returns Promise resolving to true if command exists, false otherwise
 *
 * @example
 * await commandExists('node')    // true (if Node.js installed)
 * await commandExists('nonexistent')  // false
 */
async function commandExists(command: string): Promise<boolean> {
  const isWindows = process.platform === 'win32';
  const checkCmd = isWindows ? 'where' : 'which';

  return new Promise(resolve => {
    const proc = spawn(checkCmd, [command], {
      stdio: 'ignore',
      shell: isWindows, // Required for 'where' on Windows
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);

    proc.on('close', code => {
      clearTimeout(timeout);
      resolve(code === 0);
    });

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Check if a language server is available for the given file type.
 * Checks user config, bundled servers, and PATH.
 *
 * @param filePath - Path to a source file
 * @param workspaceRoot - Optional workspace root for user config lookup
 * @returns Promise resolving to true if an LSP server is available
 *
 * @example
 * if (await isLanguageServerAvailable('/path/to/file.ts')) {
 *   // TypeScript language server is available
 * }
 */
export async function isLanguageServerAvailable(
  filePath: string,
  workspaceRoot?: string
): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();

  // 1. Check user config first
  const userConfig = await loadUserConfig(workspaceRoot);
  const userServer = userConfig[ext];

  let command: string;

  if (userServer) {
    command = userServer.command;
  } else {
    // 2. Fall back to built-in defaults
    const serverInfo = LANGUAGE_SERVER_COMMANDS[ext];
    if (!serverInfo) {
      return false;
    }
    command = resolveLanguageServer(serverInfo).command;
  }

  // Bundled server (typescript-language-server via node)
  if (command === process.execPath) {
    return true;
  }

  // Absolute path - check if file exists
  if (path.isAbsolute(command)) {
    try {
      await fs.access(command);
      return true;
    } catch {
      return false;
    }
  }

  // PATH lookup - cross-platform check
  return commandExists(command);
}

/**
 * Shutdown all cached clients.
 * Should be called during application shutdown.
 *
 * @example
 * process.on('SIGTERM', async () => {
 *   await shutdownAllClients();
 *   process.exit(0);
 * });
 */
export async function shutdownAllClients(): Promise<void> {
  for (const client of Array.from(clientCache.values())) {
    await client.stop();
  }
  clientCache.clear();
}

/**
 * Get the number of cached clients (for testing/debugging)
 */
export function getCachedClientCount(): number {
  return clientCache.size;
}

/**
 * Clear the client cache without shutting down clients (for testing)
 * @internal
 */
export function clearClientCache(): void {
  clientCache.clear();
}
