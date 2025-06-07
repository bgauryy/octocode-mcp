import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { exec as nodeExec } from 'child_process';
import { promisify } from 'util';
import { generateCacheKey, withCache } from './cache';

const safeExecAsync = promisify(nodeExec);

// Security and validation constants
const ALLOWED_NPM_COMMANDS = [
  'view', // Used in npmView, CommandBuilder.npmView
  'search', // Used in npmSearch, CommandBuilder.npmSearch
  'ping', // Used in npm-status resource
  'whoami', // Used in npm-status resource
  'version', // Used in npm-status resource
  'config', // Used in npm-status resource (npm config get registry)
  'audit', // Used in npm dependency analysis
  'list', // Used in npm dependency analysis
  'outdated', // Used in npm dependency analysis
  'help', // General help command
] as const;

const ALLOWED_GH_COMMANDS = [
  'search', // Used in all GitHub search functions
  'repo', // Used in ghRepoView, viewGitHubRepositoryInfo
  'api', // Used in viewRepositoryStructure, topics, users, discussions
  'auth', // Used in examples and auth checks
  'org', // Used in getUserOrganizations (gh org list)
  'help', // General help command
] as const;

type CommandType = 'npm' | 'gh';
type ExecOptions = {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  json?: boolean;
  cache?: boolean;
  cacheTTL?: number;
};

interface CommandExecutor {
  execute(
    command: string,
    args: string[],
    options?: ExecOptions
  ): Promise<CallToolResult>;
  validate(command: string, args: string[]): boolean;
  sanitize(args: string[]): string[];
}

// NPM Command Executor
class NpmExecutor implements CommandExecutor {
  private readonly allowedCommands = ALLOWED_NPM_COMMANDS;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validate(command: string, args: string[]): boolean {
    return this.allowedCommands.includes(command as any);
  }

  sanitize(args: string[]): string[] {
    // Return args as-is without modification
    return args;
  }

  async execute(
    command: string,
    args: string[],
    options: ExecOptions = {}
  ): Promise<CallToolResult> {
    if (!this.validate(command, args)) {
      return this.createErrorResult(
        'Invalid or blocked NPM command',
        new Error('Command validation failed')
      );
    }

    const sanitizedArgs = this.sanitize(args);
    const fullCommand = `npm ${command} ${sanitizedArgs.join(' ')}`;

    const cacheKey = options.cache
      ? generateCacheKey('npm-exec', { command, args: sanitizedArgs })
      : null;

    const executeCommand = async (): Promise<CallToolResult> => {
      try {
        const execOptions = {
          timeout: options.timeout || 30000,
          cwd: options.cwd,
          env: { ...process.env, ...options.env },
          encoding: 'utf-8' as const,
        };

        const { stdout, stderr } = await safeExecAsync(
          fullCommand,
          execOptions
        );

        if (stderr && !stderr.includes('npm WARN')) {
          return this.createErrorResult('NPM command error', new Error(stderr));
        }

        let result: any = stdout;
        if (options.json) {
          try {
            result = JSON.parse(stdout);
          } catch {
            // Keep as string if JSON parsing fails
          }
        }

        return this.createSuccessResult({
          command: fullCommand,
          result,
          timestamp: new Date().toISOString(),
          type: 'npm',
        });
      } catch (error) {
        return this.createErrorResult('Failed to execute NPM command', error);
      }
    };

    if (cacheKey) {
      return withCache(cacheKey, executeCommand);
    }

    return executeCommand();
  }

  private createSuccessResult(data: any): CallToolResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError: false,
    };
  }

  private createErrorResult(message: string, error: unknown): CallToolResult {
    return {
      content: [
        { type: 'text', text: `${message}: ${(error as Error).message}` },
      ],
      isError: true,
    };
  }
}

// GitHub CLI Command Executor
class GitHubExecutor implements CommandExecutor {
  private readonly allowedCommands = ALLOWED_GH_COMMANDS;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validate(command: string, args: string[]): boolean {
    return this.allowedCommands.includes(command as any);
  }

  sanitize(args: string[]): string[] {
    // Return args as-is without modification
    return args;
  }

  async execute(
    command: string,
    args: string[],
    options: ExecOptions = {}
  ): Promise<CallToolResult> {
    if (!this.validate(command, args)) {
      return this.createErrorResult(
        'Invalid or blocked GitHub CLI command',
        new Error('Command validation failed')
      );
    }

    const sanitizedArgs = this.sanitize(args);

    // Properly quote arguments that contain special characters
    const quotedArgs = sanitizedArgs.map(arg => {
      // If argument contains special characters that need shell quoting, wrap in single quotes
      if (/[(){}[\]<>!$&|;'"` ]/.test(arg)) {
        // Escape any single quotes in the argument and wrap in single quotes
        return `'${arg.replace(/'/g, "'\"'\"'")}'`;
      }
      return arg;
    });

    const fullCommand = `gh ${command} ${quotedArgs.join(' ')}`;

    const cacheKey = options.cache
      ? generateCacheKey('gh-exec', { command, args: sanitizedArgs })
      : null;

    const executeCommand = async (): Promise<CallToolResult> => {
      try {
        const execOptions = {
          timeout: options.timeout || 60000, // GitHub commands might take longer
          cwd: options.cwd,
          env: { ...process.env, ...options.env },
          encoding: 'utf-8' as const,
        };

        const { stdout, stderr } = await safeExecAsync(
          fullCommand,
          execOptions
        );

        if (stderr) {
          return this.createErrorResult(
            'GitHub CLI command error',
            new Error(stderr)
          );
        }

        let result: any = stdout;
        if (options.json) {
          try {
            result = JSON.parse(stdout);
          } catch {
            // Keep as string if JSON parsing fails
          }
        }

        return this.createSuccessResult({
          command: fullCommand,
          result,
          timestamp: new Date().toISOString(),
          type: 'github',
        });
      } catch (error) {
        return this.createErrorResult(
          'Failed to execute GitHub CLI command',
          error
        );
      }
    };

    if (cacheKey) {
      return withCache(cacheKey, executeCommand);
    }

    return executeCommand();
  }

  private createSuccessResult(data: any): CallToolResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError: false,
    };
  }

  private createErrorResult(message: string, error: unknown): CallToolResult {
    return {
      content: [
        { type: 'text', text: `${message}: ${(error as Error).message}` },
      ],
      isError: true,
    };
  }
}

// Main executor factory
class CommandExecutorFactory {
  private static executors = new Map<CommandType, CommandExecutor>([
    ['npm', new NpmExecutor()],
    ['gh', new GitHubExecutor()],
  ]);

  static getExecutor(type: CommandType): CommandExecutor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No executor found for command type: ${type}`);
    }
    return executor;
  }

  static getSupportedCommands(type: CommandType): readonly string[] {
    if (type === 'npm') return ALLOWED_NPM_COMMANDS;
    if (type === 'gh') return ALLOWED_GH_COMMANDS;
    return [];
  }
}

// High-level execution functions
export async function executeNpmCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<CallToolResult> {
  const executor = CommandExecutorFactory.getExecutor('npm');
  return executor.execute(command, args, options);
}

export async function executeGitHubCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<CallToolResult> {
  const executor = CommandExecutorFactory.getExecutor('gh');
  return executor.execute(command, args, options);
}

// Batch execution for multiple commands
export async function executeBatchCommands(
  commands: Array<{
    type: CommandType;
    command: string;
    args: string[];
    options?: ExecOptions;
  }>
): Promise<CallToolResult[]> {
  const results = await Promise.allSettled(
    commands.map(async ({ type, command, args, options }) => {
      const executor = CommandExecutorFactory.getExecutor(type);
      return executor.execute(command, args, options);
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Batch command ${index} failed: ${result.reason.message}`,
          },
        ],
        isError: true,
      };
    }
  });
}

// Utility functions
export function validateCommand(
  type: CommandType,
  command: string,
  args: string[]
): boolean {
  try {
    const executor = CommandExecutorFactory.getExecutor(type);
    return executor.validate(command, args);
  } catch {
    return false;
  }
}

export function getSupportedCommands(type: CommandType): readonly string[] {
  return CommandExecutorFactory.getSupportedCommands(type);
}

export function sanitizeArgs(type: CommandType, args: string[]): string[] {
  try {
    const executor = CommandExecutorFactory.getExecutor(type);
    return executor.sanitize(args);
  } catch {
    return [];
  }
}

// Pre-built command builders for common operations
export class CommandBuilder {
  static npmView(
    packageName: string,
    fields?: string[]
  ): { command: string; args: string[] } {
    const args = [packageName];
    if (fields && fields.length > 0) {
      args.push(...fields);
    }
    args.push('--json');
    return { command: 'view', args };
  }

  static npmSearch(
    query: string,
    options?: { limit?: number; json?: boolean }
  ): { command: string; args: string[] } {
    const args = [`"${query}"`];
    if (options?.limit) {
      args.push(`--searchlimit=${options.limit}`);
    }
    if (options?.json !== false) {
      args.push('--json');
    }
    return { command: 'search', args };
  }

  static ghSearchRepos(
    query: string,
    options?: { owner?: string; limit?: number }
  ): { command: string; args: string[] } {
    const args = ['repos', `"${query}"`];
    if (options?.owner) {
      args.push(`--owner=${options.owner}`);
    }
    if (options?.limit) {
      args.push(`--limit=${options.limit}`);
    }
    args.push('--json');
    return { command: 'search', args };
  }

  static ghRepoView(
    owner: string,
    repo: string
  ): { command: string; args: string[] } {
    return { command: 'repo', args: ['view', `${owner}/${repo}`] };
  }
}

// Export main interface
export const execCommands = {
  npm: executeNpmCommand,
  github: executeGitHubCommand,
  batch: executeBatchCommands,
  validate: validateCommand,
  sanitize: sanitizeArgs,
  getSupportedCommands,
  CommandBuilder,
};

export default execCommands;
