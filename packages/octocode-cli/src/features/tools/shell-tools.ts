/**
 * Shell Tools
 *
 * Provider-agnostic shell/command execution tools for the unified agent loop.
 * Compatible with Vercel AI SDK tool format.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execAsync = promisify(exec);

/**
 * Maximum output length for command results
 */
const MAX_OUTPUT_LENGTH = 50000;

/**
 * Truncate output if too long
 */
function truncateOutput(
  output: string,
  maxLength: number = MAX_OUTPUT_LENGTH
): string {
  if (output.length <= maxLength) return output;

  const truncated = output.slice(0, maxLength);
  return `${truncated}\n\n... (output truncated, ${output.length - maxLength} more characters)`;
}

/**
 * Bash tool - Execute shell commands
 */
export const bashTool = tool({
  description:
    'Execute a shell command and return its output. Use this to run build commands, tests, git operations, package management, and other shell tasks. Commands run in bash on Unix or cmd on Windows.',
  parameters: z.object({
    command: z.string().describe('The shell command to execute'),
    cwd: z.string().optional().describe('Working directory for the command'),
    timeout: z
      .number()
      .optional()
      .describe('Timeout in milliseconds (default: 60000)'),
  }),
  execute: async ({ command, cwd, timeout }) => {
    try {
      const workDir = cwd ? resolve(cwd) : process.cwd();
      const timeoutMs = timeout ?? 60000;

      const { stdout, stderr } = await execAsync(command, {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      const output = [
        stdout ? `stdout:\n${stdout}` : '',
        stderr ? `stderr:\n${stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      return truncateOutput(output || 'Command completed with no output');
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as Error & {
          stdout?: string;
          stderr?: string;
          code?: number;
          killed?: boolean;
        };

        if (execError.killed) {
          throw new Error(`Command timed out after ${timeout ?? 60000}ms`);
        }

        const output = [
          `exit code: ${execError.code ?? 'unknown'}`,
          execError.stdout ? `stdout:\n${execError.stdout}` : '',
          execError.stderr ? `stderr:\n${execError.stderr}` : '',
          !execError.stdout && !execError.stderr
            ? `error: ${execError.message}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n');

        return truncateOutput(output);
      }
      throw error;
    }
  },
});

/**
 * Grep tool - Search for patterns in files
 */
export const grepTool = tool({
  description:
    'Search for a pattern in files using grep/ripgrep. Returns matching lines with file paths and line numbers. Useful for finding code patterns, function definitions, or specific text.',
  parameters: z.object({
    pattern: z.string().describe('The regex pattern to search for'),
    path: z
      .string()
      .optional()
      .describe('Path to search in (default: current directory)'),
    include: z
      .string()
      .optional()
      .describe('File pattern to include (e.g., "*.ts")'),
    exclude: z.array(z.string()).optional().describe('Patterns to exclude'),
    caseInsensitive: z.boolean().optional().describe('Case insensitive search'),
    maxResults: z
      .number()
      .optional()
      .describe('Maximum number of results (default: 100)'),
  }),
  execute: async ({
    pattern,
    path,
    include,
    exclude,
    caseInsensitive,
    maxResults,
  }) => {
    try {
      const searchPath = path ? resolve(path) : process.cwd();
      const max = maxResults ?? 100;

      // Try ripgrep first, fall back to grep
      const useRg = await checkCommand('rg');

      let cmd: string;
      if (useRg) {
        const args = ['rg', '--line-number', '--no-heading'];
        if (caseInsensitive) args.push('-i');
        if (include) args.push('-g', include);

        const defaultExcludes = exclude ?? [
          'node_modules',
          '.git',
          'dist',
          'out',
        ];
        for (const ex of defaultExcludes) {
          args.push('-g', `!${ex}`);
        }

        args.push('--max-count', String(max));
        args.push('--', pattern, searchPath);

        cmd = args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ');
      } else {
        const grepArgs = ['grep', '-rn'];
        if (caseInsensitive) grepArgs.push('-i');
        if (include) grepArgs.push(`--include=${include}`);

        const defaultExcludes = exclude ?? [
          'node_modules',
          '.git',
          'dist',
          'out',
        ];
        for (const ex of defaultExcludes) {
          grepArgs.push(`--exclude-dir=${ex}`);
        }

        grepArgs.push(pattern, searchPath);
        cmd = `${grepArgs.join(' ')} | head -${max}`;
      }

      const { stdout } = await execAsync(cmd, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
      });

      return truncateOutput(stdout || 'No matches found');
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as Error & { code?: number; stdout?: string };

        // grep returns exit code 1 when no matches found
        if (execError.code === 1 && !execError.stdout) {
          return 'No matches found';
        }

        throw new Error(`Search failed: ${error.message}`);
      }
      throw error;
    }
  },
});

/**
 * Check if a command is available
 */
async function checkCommand(cmd: string): Promise<boolean> {
  try {
    await execAsync(`which ${cmd} 2>/dev/null || where ${cmd} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shell tools collection
 */
export const shellTools = {
  Bash: bashTool,
  Grep: grepTool,
};
