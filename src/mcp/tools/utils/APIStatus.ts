import { executeNpmCommand, parseExecResult } from '../../../utils/exec';

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
