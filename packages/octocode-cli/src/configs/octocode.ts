/**
 * Octocode MCP Server Configurations
 */

import type { MCPServer } from '../types/index.js';

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
export const OCTOCODE_NPX: MCPServer = {
  command: 'npx',
  args: ['octocode-mcp@latest'],
};
