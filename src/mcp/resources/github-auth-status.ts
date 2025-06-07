import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { execSync } from 'child_process';

// GitHub Authentication Status Resource
export function registerGithubStatusResource(server: McpServer) {
  server.resource('github-auth-status', 'github://auth-status', async uri => {
    try {
      // Check GitHub CLI version
      const ghVersion = execSync('gh --version', {
        encoding: 'utf-8',
      }).trim();

      let isAuthenticated = false;
      let authError = null;

      try {
        // gh auth status outputs to stderr, capture it
        execSync('gh auth status', {
          encoding: 'utf-8',
        });
      } catch (e) {
        // gh auth status always outputs to stderr, so we expect this "error"
        const error = e as any;
        if (error.stderr) {
          const output = error.stderr.toString().trim();
          // Only check if authenticated, don't expose user details
          isAuthenticated = output.includes('✓ Logged in');
          if (!isAuthenticated) {
            authError = 'Not authenticated';
          }
        } else {
          authError = 'Unable to check authentication status';
        }
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'GitHub Authentication Status - LIVE STATUS',
                description:
                  'GitHub CLI authentication status and version information',
                gh_version: ghVersion,
                authenticated: isAuthenticated,
                auth_error: authError,
                setup_instructions: {
                  not_authenticated: [
                    'Run: gh auth login',
                    'Follow the interactive prompts to authenticate',
                    'Choose your preferred authentication method',
                  ],
                  verification: [
                    'Run: gh auth status',
                    'Should show "✓ Logged in" if successful',
                  ],
                },
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
                status: 'GitHub Authentication Status - ERROR',
                error: (error as Error).message,
                message: 'GitHub CLI may not be installed or accessible',
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
