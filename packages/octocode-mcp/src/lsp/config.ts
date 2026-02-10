/**
 * Language server configuration and resolution
 * Handles server discovery, user config loading, and server resolution
 * @module lsp/config
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRequire } from 'module';
import { getConfigSync } from 'octocode-shared';
import type {
  LanguageServerConfig,
  UserLanguageServerConfig,
} from './types.js';
import { validateLSPServerPath } from './validation.js';
import { LSPConfigFileSchema } from './schemas.js';

// Re-export the registry from its new home
export { LANGUAGE_SERVER_COMMANDS } from './lspRegistry.js';
import { LANGUAGE_SERVER_COMMANDS } from './lspRegistry.js';

const require = createRequire(import.meta.url);

/**
 * Load user-defined language server configs from config files.
 * Checks (in order):
 * 1. OCTOCODE_LSP_CONFIG env var
 * 2. .octocode/lsp-servers.json (workspace-level)
 * 3. ~/.octocode/lsp-servers.json (user-level)
 *
 * @param workspaceRoot - Workspace root to check for local config
 * @returns Language server configs by extension, or empty object
 */
export async function loadUserConfig(
  workspaceRoot?: string
): Promise<Record<string, UserLanguageServerConfig>> {
  const configPaths: string[] = [];

  // 1. Environment variable or global config
  const lspConfigPath =
    process.env.OCTOCODE_LSP_CONFIG ||
    (() => {
      try {
        return getConfigSync().lsp.configPath;
      } catch {
        return undefined;
      }
    })();
  if (lspConfigPath) {
    configPaths.push(lspConfigPath);
  }

  // 2. Workspace-level config
  if (workspaceRoot) {
    configPaths.push(path.join(workspaceRoot, '.octocode', 'lsp-servers.json'));
  }

  // 3. User-level config
  configPaths.push(path.join(os.homedir(), '.octocode', 'lsp-servers.json'));

  for (const configPath of configPaths) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const raw = JSON.parse(content);
      const validation = LSPConfigFileSchema.safeParse(raw);
      if (!validation.success) continue;
      const config = validation.data;
      if (config.languageServers) {
        return config.languageServers as unknown as Record<
          string,
          UserLanguageServerConfig
        >;
      }
    } catch {
      // Config file doesn't exist or is invalid, try next
    }
  }

  // No user config found
  return {};
}

// ============================================================================
// Server Resolution
// ============================================================================

/**
 * Resolve language server command from env vars or bundled packages
 *
 * @param config - Server configuration with command, args, and envVar
 * @returns Resolved command and args
 */
export function resolveLanguageServer(config: {
  command: string;
  args: string[];
  envVar: string;
}): { command: string; args: string[] } {
  // 1. Check Env Var
  if (process.env[config.envVar]) {
    return { command: process.env[config.envVar]!, args: config.args };
  }

  // 2. Special handling for typescript-language-server (use bundled if available)
  if (config.command === 'typescript-language-server') {
    try {
      const pkgPath =
        require.resolve('typescript-language-server/package.json');
      const pkg = require(pkgPath);
      const pkgDir = path.dirname(pkgPath);

      // Validate bin entry exists and is a string
      const binRelativePath = pkg.bin?.['typescript-language-server'];
      if (!binRelativePath || typeof binRelativePath !== 'string') {
        return { command: config.command, args: config.args };
      }

      // Construct and validate the binary path
      const binPath = path.join(pkgDir, binRelativePath);

      // SECURITY: Validate the resolved path before using it
      const validation = validateLSPServerPath(binPath, pkgDir);
      if (!validation.isValid) {
        return { command: config.command, args: config.args };
      }

      return {
        command: process.execPath,
        args: [validation.resolvedPath!, ...config.args],
      };
    } catch {
      // Bundled server not available - fall back to command
    }
  }

  return { command: config.command, args: config.args };
}

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Detect language ID from file extension
 *
 * @param filePath - Path to the file
 * @returns Language ID (e.g., 'typescript', 'python') or 'plaintext' if unknown
 */
export function detectLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_SERVER_COMMANDS[ext]?.languageId ?? 'plaintext';
}

/**
 * Get language server config for a file
 * Checks user config first, then falls back to defaults.
 *
 * @param filePath - Path to the source file
 * @param workspaceRoot - Workspace root directory
 * @returns Language server config or null if no server available
 */
export async function getLanguageServerForFile(
  filePath: string,
  workspaceRoot: string
): Promise<LanguageServerConfig | null> {
  const ext = path.extname(filePath).toLowerCase();

  // 1. Check user config first
  const userConfig = await loadUserConfig(workspaceRoot);
  const userServer = userConfig[ext];
  if (userServer) {
    return {
      command: userServer.command,
      args: userServer.args ?? [],
      workspaceRoot,
      languageId: userServer.languageId,
    };
  }

  // 2. Fall back to built-in defaults
  const serverInfo = LANGUAGE_SERVER_COMMANDS[ext];
  if (!serverInfo) return null;

  const { command, args } = resolveLanguageServer(serverInfo);

  return {
    command,
    args,
    workspaceRoot,
    languageId: serverInfo.languageId,
  };
}
