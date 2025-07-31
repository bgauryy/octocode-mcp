import {
  executeGitHubCommand,
  executeNpmCommand,
  parseExecResult,
} from '../../../utils/exec';

export async function registerApiStatusCheckTool() {
  let githubConnected = false;
  let organizations: string[] = [];

  try {
    const authResult = await executeGitHubCommand('auth', ['status']);

    if (!authResult.isError) {
      const execResult = parseExecResult(authResult);
      const isAuthenticated =
        typeof execResult?.result === 'string'
          ? execResult.result.includes('Logged in') ||
            execResult.result.includes('github.com')
          : false;

      if (isAuthenticated) {
        githubConnected = true;

        // Get user organizations
        try {
          const orgsResult = await executeGitHubCommand(
            'org',
            ['list', '--limit=50'],
            { cache: false }
          );
          const orgsExecResult = parseExecResult(orgsResult);
          const output =
            typeof orgsExecResult?.result === 'string'
              ? orgsExecResult.result
              : '';

          if (typeof output === 'string') {
            organizations = output
              .split('\n')
              .map((org: string) => org.trim())
              .filter((org: string) => org.length > 0);
          }
        } catch (orgError) {
          // Organizations fetch failed, but GitHub is still connected
        }
      }
    }
  } catch (error) {
    githubConnected = false;
  }

  return {
    githubConnected,
    organizations,
  };
}

export async function getNPMUserDetails(): Promise<{
  npmConnected: boolean;
  registry: string;
}> {
  let npmConnected = false;
  let registry = '';

  try {
    const npmResult = await executeNpmCommand('whoami', [], {
      timeout: 5000,
    });

    if (!npmResult.isError) {
      npmConnected = true;
      // Get registry info
      const registryResult = await executeNpmCommand(
        'config',
        ['get', 'registry'],
        { timeout: 3000 }
      );
      const registryExecResult = parseExecResult(registryResult);
      registry =
        typeof registryExecResult?.result === 'string'
          ? registryExecResult.result.trim()
          : 'https://registry.npmjs.org/';
    }
  } catch (error) {
    npmConnected = false;
  }

  return {
    npmConnected,
    registry,
  };
}
