import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execSync } from 'child_process';

// Sanitize output to remove potential tokens
function sanitizeOutput(output: string): string {
  if (!output) return output;

  // Remove common token patterns - be more specific to avoid false positives
  return (
    output
      // Remove npm tokens (npm_xxxxx)
      .replace(/npm_[a-zA-Z0-9_-]{36,}/g, '[REDACTED_NPM_TOKEN]')
      // Remove Bearer tokens
      .replace(/Bearer\s+[a-zA-Z0-9+/=_-]+/gi, 'Bearer [REDACTED_TOKEN]')
      // Remove authorization headers
      .replace(/authorization:\s*[^\s\n]+/gi, 'authorization: [REDACTED]')
      // Remove specific npm token patterns (more conservative)
      .replace(
        /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
        '[REDACTED_UUID_TOKEN]'
      )
      // Remove base64 tokens that are clearly tokens (very long strings)
      .replace(/\b[A-Za-z0-9+/]{64,}={0,2}\b/g, '[REDACTED_TOKEN]')
  );
}

// Whitelist of safe npm commands
const SAFE_NPM_COMMANDS = [
  'npm --version',
  'node --version',
  'npm config get registry',
  'npm ping',
  'npm whoami',
] as const;

// Execute npm command safely without exposing tokens
function safeExecSync(command: string): string {
  // Validate command is in whitelist
  if (!SAFE_NPM_COMMANDS.includes(command as any)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 10000, // 10 second timeout
      // Don't inherit environment variables that might contain tokens
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        // Explicitly exclude all potential token environment variables
        NPM_TOKEN: undefined,
        NPM_AUTH_TOKEN: undefined,
        NPM_CONFIG_AUTHTOKEN: undefined,
        NPM_CONFIG_TOKEN: undefined,
        NPM_CONFIG__AUTH: undefined,
        NPM_CONFIG__AUTHTOKEN: undefined,
        _AUTH_TOKEN: undefined,
        _AUTHTOKEN: undefined,
      },
    }).trim();
    return sanitizeOutput(output);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Don't return the full error message as it might contain sensitive info
    if (errorMessage.includes('timeout')) {
      return 'Command timed out';
    }
    if (errorMessage.includes('ENOENT')) {
      return 'Command not found';
    }
    return 'Command failed';
  }
}

export function registerNpmStatusResource(server: McpServer) {
  server.resource('npm-status', 'npm://status', async uri => {
    try {
      // Get versions
      const npmVersion = safeExecSync('npm --version');
      const nodeVersion = safeExecSync('node --version');

      // Get registry
      const registryUrl = safeExecSync('npm config get registry');

      // Check registry connectivity
      const pingOutput = safeExecSync('npm ping');

      // Check authentication - just determine if authenticated, don't expose username
      let authStatus = 'Not authenticated';
      const whoamiOutput = safeExecSync('npm whoami');

      // Parse npm whoami output
      if (
        whoamiOutput &&
        !whoamiOutput.includes('npm ERR!') &&
        !whoamiOutput.includes('EAUTHUNKNOWN') &&
        !whoamiOutput.includes('[REDACTED') &&
        !whoamiOutput.includes('Command failed') &&
        !whoamiOutput.includes('Command timed out') &&
        whoamiOutput.length > 0
      ) {
        // Successfully authenticated - don't expose username
        authStatus = 'Authenticated';
      } else {
        authStatus = 'Not authenticated';
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'NPM CLI integration - LIVE STATUS',
                npm_version: npmVersion,
                node_version: nodeVersion,
                registry: registryUrl,
                registry_status: pingOutput,
                authentication: authStatus,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'NPM CLI integration - ERROR',
                error: 'Failed to get npm status',
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  });
}
