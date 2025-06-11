import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData, NpmLicenseResult } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmGetLicense(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-get-license', { packageName });

  return withCache(cacheKey, async () => {
    try {
      const result = await executeNpmCommand('view', [packageName, '--json'], {
        cache: true,
      });

      if (result.isError) {
        return result;
      }

      // Parse the result from the executed command
      const commandOutput = JSON.parse(result.content[0].text as string);
      // The result is a JSON string from npm that needs to be parsed again
      const npmData: NpmData = JSON.parse(commandOutput.result);

      // Extract only license data
      const licenseResult: NpmLicenseResult = {
        packageName: npmData.name,
        license: npmData.license,
      };

      return createSuccessResult(licenseResult);
    } catch (error) {
      return createErrorResult('Failed to get npm license information', error);
    }
  });
}
