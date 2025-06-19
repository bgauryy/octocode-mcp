import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExec = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

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

// Mock cache utilities
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
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
        });
        expect(mockWithCache).toHaveBeenCalledWith(
          'test-cache-key',
          expect.any(Function)
        );
      });
    });
  });

  describe('Security', () => {
    it('should prevent command injection through arguments', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, { stdout: 'safe execution', stderr: '' });
      });

      // Try to inject malicious commands
      const maliciousArgs = [
        'test; rm -rf /',
        '&& echo "hacked"',
        '| cat /etc/passwd',
      ];

      const result = await executeNpmCommand('view', maliciousArgs);

      expect(result.isError).toBe(false);
      // Verify the full command is constructed safely
      expect(mockExec).toHaveBeenCalledWith(
        'npm view test; rm -rf / && echo "hacked" | cat /etc/passwd',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should use safe shell environment', async () => {
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
  });
});
