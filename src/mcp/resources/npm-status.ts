import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeNpmCommand } from '../../utils/exec';

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

// Execute npm command safely using the safe implementation
async function safeNpmCommand(
  command: string,
  args: string[] = []
): Promise<string> {
  try {
    const result = await executeNpmCommand(command, args, {
      timeout: 10000, // 10 second timeout
      cache: false, // Don't cache status commands
    });

    if (result.isError) {
      const errorText = String(result.content[0]?.text || 'Command failed');
      // Don't return the full error message as it might contain sensitive info
      if (errorText.includes('timeout')) {
        return 'Command timed out';
      }
      if (errorText.includes('ENOENT')) {
        return 'Command not found';
      }
      return 'Command failed';
    }

    // Extract the result from the successful response
    const content = String(result.content[0]?.text || '');
    if (content) {
      try {
        const parsed = JSON.parse(content);
        const output = parsed.result || content;
        return sanitizeOutput(String(output).trim());
      } catch {
        // If JSON parsing fails, sanitize the raw content
        return sanitizeOutput(content.trim());
      }
    }

    return 'No output';
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
      // Get versions using safe commands
      const npmVersion = await safeNpmCommand('version', []);
      const nodeVersion = process.version; // Use process.version instead of exec

      // Get registry
      const registryUrl = await safeNpmCommand('config', ['get', 'registry']);

      // Check registry connectivity
      const pingOutput = await safeNpmCommand('ping', []);

      // Check authentication - just determine if authenticated, don't expose username
      let authStatus = 'Not authenticated';
      const whoamiOutput = await safeNpmCommand('whoami', []);

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
