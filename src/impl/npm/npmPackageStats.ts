import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeNpmCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmPackageStats(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-stats', { packageName });

  return withCache(cacheKey, async () => {
    try {
      // Execute multiple commands in parallel using executeNpmCommand
      const commands = [
        executeNpmCommand('view', [packageName, 'time', '--json']),
        executeNpmCommand('view', [packageName, 'versions', '--json']),
        executeNpmCommand('view', [packageName, 'dist-tags', '--json']),
      ];

      const results = await Promise.allSettled(commands);

      const stats = {
        packageName,
        releaseHistory:
          results[0].status === 'fulfilled' && !results[0].value.isError
            ? JSON.parse(results[0].value.content[0].text as string).result
            : null,
        versions:
          results[1].status === 'fulfilled' && !results[1].value.isError
            ? JSON.parse(results[1].value.content[0].text as string).result
            : null,
        distTags:
          results[2].status === 'fulfilled' && !results[2].value.isError
            ? JSON.parse(results[2].value.content[0].text as string).result
            : null,
        analyzedAt: new Date().toISOString(),
      };

      return createSuccessResult(stats);
    } catch (error) {
      return createErrorResult('Failed to get npm package statistics', error);
    }
  });
}
