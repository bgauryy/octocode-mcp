import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { generateCacheKey, withCache } from './cache';
import { NpmRepositoryResult, NpmSearchParams } from '../types';

const execAsync = promisify(exec);

export async function npmView(packageName: string): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-view', { packageName });

  return withCache(cacheKey, async () => {
    try {
      const { stdout } = await execAsync(
        `npm view ${packageName} name version description keywords homepage repository bugs license author maintainers dependencies devDependencies peerDependencies scripts engines dist.tarball dist.unpackedSize --json`
      );
      const result: NpmRepositoryResult = JSON.parse(stdout);
      
      let popularityData = '';
      try {
        const { stdout: weeklyDownloads } = await execAsync(
          `npm view ${packageName} --json | jq -r '.time | keys | length'`
        );
        popularityData = `Package versions released: ${weeklyDownloads.trim()}`;
      } catch {
        // Popularity data is optional
      }

      const enhancedResult = {
        ...result,
        popularityInfo: popularityData,
        lastAnalyzed: new Date().toISOString()
      };

      return createSuccessResult(enhancedResult);
    } catch (error) {
      return createErrorResult(
        'Failed to get npm repository information',
        error
      );
    }
  });
}

export async function npmSearch(
  args: NpmSearchParams
): Promise<CallToolResult> {
  const { query, json = true, searchlimit = 50 } = args;
  let command = `npm search "${query}" --searchlimit=${searchlimit}`;
  if (json) {
    command += ' --json';
  }

  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      return {
        content: [{ type: 'text', text: `Error searching NPM: ${stderr}` }],
        isError: true,
      };
    }

    if (json) {
      try {
        const results = JSON.parse(stdout);
        const enhancedResults = {
          searchQuery: query,
          resultCount: results.length,
          searchLimitApplied: searchlimit,
          results: results,
          searchTips: results.length === 0 
            ? "Try broader terms like 'react', 'cli', or 'typescript'" 
            : results.length >= searchlimit 
              ? "Results limited. Use more specific terms to narrow down."
              : "Good result set size for analysis.",
          timestamp: new Date().toISOString()
        };
        return createSuccessResult(enhancedResults);
      } catch {
        // Fallback to raw output if JSON parsing fails
      }
    }

    return {
      content: [{ type: 'text', text: stdout }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to execute npm search: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

export async function npmPackageStats(packageName: string): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-stats', { packageName });

  return withCache(cacheKey, async () => {
    try {
      const commands = [
        `npm view ${packageName} time --json`,
        `npm view ${packageName} versions --json`,
        `npm view ${packageName} dist-tags --json`
      ];

      const results = await Promise.allSettled(
        commands.map(cmd => execAsync(cmd))
      );

      const stats = {
        packageName,
        releaseHistory: results[0].status === 'fulfilled' ? JSON.parse(results[0].value.stdout) : null,
        versions: results[1].status === 'fulfilled' ? JSON.parse(results[1].value.stdout) : null,
        distTags: results[2].status === 'fulfilled' ? JSON.parse(results[2].value.stdout) : null,
        analyzedAt: new Date().toISOString()
      };

      return createSuccessResult(stats);
    } catch (error) {
      return createErrorResult('Failed to get npm package statistics', error);
    }
  });
}

function createSuccessResult(data: any): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    isError: false,
  };
}

function createErrorResult(message: string, error: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: `${message}: ${(error as Error).message}`,
      },
    ],
    isError: true,
  };
}
