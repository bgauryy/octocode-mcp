import { executeNpmCommand } from './exec';

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

      if (
        !registryResult.isError &&
        registryResult.content?.[0]?.type === 'text'
      ) {
        const registryText = registryResult.content[0].text;
        try {
          // Try to parse the JSON response to get the data
          const parsed = JSON.parse(registryText);
          const registryData = parsed.data || parsed;
          registry =
            typeof registryData === 'string'
              ? registryData.trim()
              : 'https://registry.npmjs.org/';
        } catch {
          // If parsing fails, use the raw text
          registry = registryText.trim() || 'https://registry.npmjs.org/';
        }
      } else {
        registry = 'https://registry.npmjs.org/';
      }
    }
  } catch (error) {
    npmConnected = false;
  }

  return {
    npmConnected,
    registry,
  };
}
