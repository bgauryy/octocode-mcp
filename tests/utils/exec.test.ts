import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { platform } from 'os';
import {
  executeNpmCommand,
  executeGitHubCommand,
  type NpmCommand,
  type GhCommand,
} from '../../src/utils/exec';
import * as cache from '../../src/utils/cache';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecAsync = vi.hoisted(() => vi.fn());

// Mock child_process and util
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecAsync),
}));

vi.mock('os');
vi.mock('../../src/utils/cache');

describe('exec utilities', () => {
  const mockPlatform = vi.mocked(platform);
  const mockWithCache = vi.mocked(cache.withCache);
  const mockGenerateCacheKey = vi.mocked(cache.generateCacheKey);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('darwin');
    process.env.SHELL = '/bin/bash';

    // Default mock for cache - passthrough
    mockWithCache.mockImplementation(async (_key, fn) => fn());
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('executeNpmCommand', () => {
    it('should execute valid npm commands successfully', async () => {
      const mockStdout = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
      });
      mockExecAsync.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const result = await executeNpmCommand('view', ['test-package']);

      expect(result.isError).toBe(false);
      expect(mockExecAsync).toHaveBeenCalledWith(
        'npm view test-package',
        expect.objectContaining({
          timeout: 30000,
          maxBuffer: 5 * 1024 * 1024,
          encoding: 'utf-8',
        })
      );

      const content = JSON.parse(result.content[0].text as string);
      expect(content.result).toEqual({
        name: 'test-package',
        version: '1.0.0',
      });
    });

    it('should reject invalid npm commands', async () => {
      const result = await executeNpmCommand('invalid' as NpmCommand);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Command not registered');
      expect(result.content[0].text).toContain('not in the allowed list');
    });

    it('should handle npm errors correctly', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: '',
        stderr: 'npm ERR! Package not found',
      });

      const result = await executeNpmCommand('view', ['non-existent-package']);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NPM command error');
    });

    it('should ignore npm warnings', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ data: 'test' }),
        stderr: 'npm WARN deprecated package',
      });

      const result = await executeNpmCommand('view', ['test-package']);

      expect(result.isError).toBe(false);
      const content = JSON.parse(result.content[0].text as string);
      expect(content.warning).toContain('npm WARN');
    });

    it('should use cache when cache option is true', async () => {
      const mockResult = {
        content: [{ type: 'text' as const, text: 'cached' }],
        isError: false,
      };
      mockWithCache.mockResolvedValue(mockResult);

      const result = await executeNpmCommand('view', ['test-package'], {
        cache: true,
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('npm-exec', {
        command: 'view',
        args: ['test-package'],
        shell: 'unix',
      });
      expect(mockWithCache).toHaveBeenCalled();
      expect(result).toBe(mockResult);
    });

    it('should handle execution timeout', async () => {
      const error = new Error('Command timed out');
      (error as Error & { code?: string }).code = 'ETIMEDOUT';
      mockExecAsync.mockRejectedValue(error);

      const result = await executeNpmCommand('search', ['test'], {
        timeout: 1000,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to execute NPM command');
    });
  });

  describe('executeGitHubCommand', () => {
    it('should execute valid github commands successfully', async () => {
      const mockStdout = JSON.stringify([{ name: 'repo1' }, { name: 'repo2' }]);
      mockExecAsync.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const result = await executeGitHubCommand('search', ['repos', 'test']);

      expect(result.isError).toBe(false);
      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh search repos test',
        expect.objectContaining({
          timeout: 60000,
          maxBuffer: 5 * 1024 * 1024,
          encoding: 'utf-8',
        })
      );
    });

    it('should reject invalid github commands', async () => {
      const result = await executeGitHubCommand('invalid' as GhCommand);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Command not registered');
    });

    it('should preserve GitHub search qualifiers', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '[]', stderr: '' });

      await executeGitHubCommand('search', [
        'repos',
        'test query',
        'language:typescript',
        'user:microsoft',
        '(user:microsoft OR org:microsoft)',
      ]);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining(
          'language:typescript user:microsoft (user:microsoft OR org:microsoft)'
        ),
        expect.any(Object)
      );
    });

    it('should handle complex queries with quotes', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '[]', stderr: '' });

      await executeGitHubCommand('search', [
        'code',
        '"exact phrase" other terms',
      ]);

      const calledCommand = mockExecAsync.mock.calls[0][0];
      expect(calledCommand).toContain('"exact phrase" other terms');
    });
  });

  describe('shell escaping', () => {
    it('should escape arguments properly on Unix', async () => {
      mockPlatform.mockReturnValue('darwin');
      mockExecAsync.mockResolvedValue({ stdout: '{}', stderr: '' });

      await executeNpmCommand('view', ['package-with-$pecial-chars']);

      const calledCommand = mockExecAsync.mock.calls[0][0];
      expect(calledCommand).toContain("'package-with-$pecial-chars'");
    });

    it('should escape arguments properly on Windows CMD', async () => {
      mockPlatform.mockReturnValue('win32');
      mockExecAsync.mockResolvedValue({ stdout: '{}', stderr: '' });

      await executeNpmCommand('view', ['package with spaces'], {
        windowsShell: 'cmd',
      });

      const calledCommand = mockExecAsync.mock.calls[0][0];
      expect(calledCommand).toContain('"package with spaces"');
    });

    it('should escape arguments properly on Windows PowerShell', async () => {
      mockPlatform.mockReturnValue('win32');
      mockExecAsync.mockResolvedValue({ stdout: '{}', stderr: '' });

      await executeNpmCommand('view', ["package'with'quotes"], {
        windowsShell: 'powershell',
      });

      const calledCommand = mockExecAsync.mock.calls[0][0];
      expect(calledCommand).toContain("'package''with''quotes'");
    });

    it('should not over-escape GitHub AND queries', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '[]', stderr: '' });

      await executeGitHubCommand('search', ['repos', 'term1 term2 term3']);

      const calledCommand = mockExecAsync.mock.calls[0][0];
      expect(calledCommand).toMatch(/term1 term2 term3/);
    });
  });

  describe('environment handling', () => {
    it('should pass custom environment variables', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '{}', stderr: '' });

      await executeNpmCommand('view', ['test'], {
        env: { CUSTOM_VAR: 'test-value' },
      });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: expect.objectContaining({
            CUSTOM_VAR: 'test-value',
            PATH: process.env.PATH,
          }),
        })
      );
    });

    it('should use custom working directory', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '{}', stderr: '' });

      await executeNpmCommand('view', ['test'], { cwd: '/custom/path' });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cwd: '/custom/path',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle shell configuration conflicts gracefully', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ result: 'success' }),
        stderr: 'head: illegal option -- 1',
      });

      const result = await executeGitHubCommand('search', ['repos', 'test']);

      expect(result.isError).toBe(false);
      const content = JSON.parse(result.content[0].text as string);
      expect(content.warning).toContain('head: illegal option');
    });

    it('should handle large output without buffer overflow', async () => {
      const largeOutput = 'x'.repeat(1024 * 1024); // 1MB of data
      mockExecAsync.mockResolvedValue({ stdout: largeOutput, stderr: '' });

      const result = await executeNpmCommand('search', ['test']);

      expect(result.isError).toBe(false);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxBuffer: 5 * 1024 * 1024, // 5MB buffer
        })
      );
    });
  });
});
