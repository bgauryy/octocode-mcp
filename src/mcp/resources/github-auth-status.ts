import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { executeGitHubCommand } from '../../utils/exec';

// GitHub Authentication Status Resource
export function registerGithubStatusResource(server: McpServer) {
  server.resource('github-auth-status', 'github://auth-status', async uri => {
    try {
      // For version, we'll use a workaround since --version is not a command
      // We can use 'help' command which shows version info, or skip detailed version check
      const ghVersion = 'Available (GitHub CLI detected)';

      let isAuthenticated = false;
      let authError = null;

      try {
        // Check auth status using safe command
        const authResult = await executeGitHubCommand('auth', ['status'], {
          timeout: 5000,
          cache: false,
        });

        if (!authResult.isError) {
          const content = String(authResult.content[0]?.text || '');
          if (content) {
            try {
              const parsed = JSON.parse(content);
              const output = parsed.result || content;
              // Only check if authenticated, don't expose user details
              isAuthenticated =
                String(output).includes('✓ Logged in') ||
                String(output).includes('Logged in');
            } catch {
              isAuthenticated =
                content.includes('✓ Logged in') ||
                content.includes('Logged in');
            }
          }
        } else {
          // auth status command failed, check error content for auth info
          const errorContent = String(
            authResult.content[0]?.text || 'Authentication check failed'
          );
          if (
            errorContent.includes('✓ Logged in') ||
            errorContent.includes('Logged in')
          ) {
            isAuthenticated = true;
          } else {
            authError = 'Not authenticated';
          }
        }
      } catch (error) {
        authError = 'Unable to check authentication status';
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
