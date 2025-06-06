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
        `npm view ${packageName} repository.url repository.directory dependencies devdependencies peerDependencies version --json`
      );
      const result: NpmRepositoryResult = JSON.parse(stdout);
      return createSuccessResult(result);
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
  const { query, json = true, searchlimit = 20 } = args;
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
