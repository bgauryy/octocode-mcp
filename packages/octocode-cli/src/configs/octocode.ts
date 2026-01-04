/**
 * Octocode MCP Server Configurations
 */

import type { MCPServer } from '../types/index.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Direct installation config (curl + node)
 * Downloads and runs the latest octocode-mcp directly
 */
export const OCTOCODE_DIRECT: MCPServer = {
  command: 'bash',
  args: [
    '-c',
    'curl -sL https://octocodeai.com/octocode/latest/index.js -o /tmp/index.js && node /tmp/index.js',
  ],
};

/**
 * Direct installation config for Windows (PowerShell)
 */
export const OCTOCODE_DIRECT_WINDOWS: MCPServer = {
  command: 'powershell',
  args: [
    '-Command',
    "Invoke-WebRequest -Uri 'https://octocodeai.com/octocode/latest/index.js' -OutFile $env:TEMP\\index.js; node $env:TEMP\\index.js",
  ],
};

/**
 * NPX installation config
 * Uses npx to run the latest octocode-mcp from npm
 */
export const OCTOCODE_NPX_REMOTE: MCPServer = {
  command: 'npx',
  args: ['octocode-mcp@latest'],
};

/**
 * Local development config
 * Runs the local octocode-mcp build directly
 */
export const OCTOCODE_LOCAL: MCPServer = {
  command: 'node',
  args: [join(process.cwd(), '..', 'octocode-mcp', 'dist', 'index.js')],
};

/**
 * Find the best available MCP server config
 * Prefers local build if available, falls back to npx
 */
function findBestMCPConfig(): MCPServer {
  // Get the directory where this module is located
  const moduleDir = new URL('.', import.meta.url).pathname;

  // Check for local build first (for development)
  const localPaths = [
    // Relative from this config file (configs/ -> features/ -> src/ -> octocode-cli -> packages -> octocode-mcp)
    join(moduleDir, '..', '..', '..', 'octocode-mcp', 'dist', 'index.js'),
    // Relative from octocode-cli package root
    join(moduleDir, '..', '..', '..', '..', 'octocode-mcp', 'dist', 'index.js'),
    // Relative from CWD (if in monorepo)
    join(process.cwd(), '..', 'octocode-mcp', 'dist', 'index.js'),
    join(process.cwd(), 'packages', 'octocode-mcp', 'dist', 'index.js'),
    // Common dev locations
    join(
      process.env.HOME || '',
      'octocode-mcp',
      'packages',
      'octocode-mcp',
      'dist',
      'index.js'
    ),
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return {
        command: 'node',
        args: [localPath],
      };
    }
  }

  // Fall back to npx (requires npm registry access)
  return OCTOCODE_NPX_REMOTE;
}

/**
 * Default MCP server config
 * Auto-detects local build or uses npx
 */
export const OCTOCODE_NPX: MCPServer = findBestMCPConfig();
