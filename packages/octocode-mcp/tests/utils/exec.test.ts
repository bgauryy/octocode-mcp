import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// child_process is mocked in setup.ts

import {
  getGithubCLIToken,
  parseExecResult,
  executeNpmCommand,
  checkNpmAvailability,
} from '../../src/utils/exec';

// Mock process for testing
class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid = 12345;
  killed = false;
  exitCode: number | null = null;
  signalCode: string | null = null;

  kill(signal?: string) {
    this.killed = true;
    this.signalCode = signal || 'SIGTERM';
    // Simulate async kill
    setTimeout(() => {
      this.emit('close', null, signal);
    }, 10);
    return true;
  }

  // Simulate successful execution
  simulateSuccess(stdout = '', stderr = '') {
    setTimeout(() => {
      if (stdout) this.stdout.emit('data', stdout);
      if (stderr) this.stderr.emit('data', stderr);
      this.exitCode = 0;
      this.emit('close', 0);
    }, 10);
  }

  // Simulate failure
  simulateFailure(exitCode = 1, stderr = '', stdout = '') {
    setTimeout(() => {
      if (stdout) this.stdout.emit('data', stdout);
      if (stderr) this.stderr.emit('data', stderr);
      this.exitCode = exitCode;
      this.emit('close', exitCode);
    }, 10);
  }

  // Simulate error during spawn
  simulateError(error: Error) {
    setTimeout(() => {
      this.emit('error', error);
    }, 10);
  }

  // Simulate timeout (no close event)
  simulateTimeout() {
    // Just emit data but never close
    setTimeout(() => {
      this.stdout.emit('data', 'some output');
    }, 10);
  }
}

describe('exec utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('parseExecResult', () => {
    it('should handle successful execution', () => {
      const result = parseExecResult('success output', '');

      expect(result).toEqual({
        isError: false,
        content: [
          {
            type: 'text',
            text: `data: "success output"\n`,
          },
        ],
      });
    });

    it('should handle error with Error object', () => {
      const error = new Error('Command failed');
      const result = parseExecResult('', 'error output', error);

      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: `instructions: "Command failed: Command failed"
data:
  error: true
`,
          },
        ],
      });
    });

    it('should handle stderr without error object', () => {
      const result = parseExecResult('', 'error in stderr');

      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: `instructions: "Command error: error in stderr"
data:
  error: true
`,
          },
        ],
      });
    });

    it('should handle empty stderr', () => {
      const result = parseExecResult('output', '   ');

      expect(result).toEqual({
        isError: false,
        content: [
          {
            type: 'text',
            text: `data: "output"\n`,
          },
        ],
      });
    });

    it('should prioritize Error object over stderr', () => {
      const error = new Error('Main error');
      const result = parseExecResult('', 'stderr message', error);

      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: `instructions: "Command failed: Main error"
data:
  error: true
`,
          },
        ],
      });
    });
  });

  describe('getGithubCLIToken', () => {
    let mockProcess: MockChildProcess;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
      mockProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
    });

    it('should return token on successful auth', async () => {
      const promise = getGithubCLIToken();
      mockProcess.simulateSuccess(
        'ghp_1234567890abcdef1234567890abcdef12345678\n'
      );

      const result = await promise;

      expect(result).toBe('ghp_1234567890abcdef1234567890abcdef12345678');
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        'gh',
        ['auth', 'token'],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 10000,
        })
      );
    });

    it('should return null on command failure', async () => {
      const promise = getGithubCLIToken();
      mockProcess.simulateFailure(1, 'not authenticated');

      const result = await promise;

      expect(result).toBeNull();
    });

    it('should return null on spawn error', async () => {
      const promise = getGithubCLIToken();
      mockProcess.simulateError(new Error('ENOENT: gh command not found'));

      const result = await promise;

      expect(result).toBeNull();
    });

    it('should return null on timeout', async () => {
      vi.useFakeTimers();

      const promise = getGithubCLIToken();
      mockProcess.simulateTimeout();

      // Fast-forward past timeout (10 seconds)
      await vi.advanceTimersByTimeAsync(10000);

      const result = await promise;

      expect(result).toBeNull();
      expect(mockProcess.killed).toBe(true);

      vi.useRealTimers();
    });

    it('should handle empty token response', async () => {
      const promise = getGithubCLIToken();
      mockProcess.simulateSuccess('   \n  ');

      const result = await promise;

      expect(result).toBeNull();
    });

    it('should trim whitespace from token', async () => {
      const promise = getGithubCLIToken();
      mockProcess.simulateSuccess('  ghp_token123  \n\t  ');

      const result = await promise;

      expect(result).toBe('ghp_token123');
    });

    it('should ignore stderr output', async () => {
      const promise = getGithubCLIToken();

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'ghp_validtoken123');
        mockProcess.stderr.emit('data', 'warning: some warning message');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;

      expect(result).toBe('ghp_validtoken123');
    });

    it('should remove dangerous environment variables', async () => {
      const promise = getGithubCLIToken();
      mockProcess.simulateSuccess('token');

      await promise;

      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const spawnOptions = spawnCall?.[2];

      expect(spawnOptions?.env?.NODE_OPTIONS).toBeUndefined();
    });

    it('should handle multiple data events for token', async () => {
      const promise = getGithubCLIToken();

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'ghp_first');
        mockProcess.stdout.emit('data', 'part_second');
        mockProcess.stdout.emit('data', 'part_third');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;

      expect(result).toBe('ghp_firstpart_secondpart_third');
    });
  });

  describe('executeNpmCommand', () => {
    let mockProcess: MockChildProcess;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
      mockProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
    });

    it('should execute allowed npm command and return stdout', async () => {
      const promise = executeNpmCommand('search', ['axios', '--json']);
      mockProcess.simulateSuccess('[{"name": "axios"}]', '');

      const result = await promise;

      expect(result.stdout).toBe('[{"name": "axios"}]');
      expect(result.stderr).toBe('');
      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
    });

    it('should reject non-allowed npm commands', async () => {
      const result = await executeNpmCommand('install' as 'search', [
        'some-package',
      ]);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('not allowed');
    });

    it('should validate arguments for null bytes', async () => {
      const result = await executeNpmCommand('search', ['package\0name']);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Null bytes');
    });

    it('should validate arguments for excessive length', async () => {
      const longArg = 'a'.repeat(1001);
      const result = await executeNpmCommand('search', [longArg]);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('too long');
    });

    it('should reject command substitution patterns', async () => {
      const result = await executeNpmCommand('search', ['$(whoami)']);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Suspicious pattern');
    });

    it('should reject backtick command substitution', async () => {
      const result = await executeNpmCommand('search', ['`whoami`']);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Suspicious pattern');
    });

    it('should reject pipe patterns', async () => {
      const result = await executeNpmCommand('search', ['axios | rm']);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Suspicious pattern');
    });

    it('should reject command chaining with semicolon', async () => {
      const result = await executeNpmCommand('search', ['axios; rm -rf']);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Suspicious pattern');
    });

    it('should reject AND command chaining', async () => {
      const result = await executeNpmCommand('search', ['axios && rm']);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Suspicious pattern');
    });

    it('should reject OR command chaining', async () => {
      const result = await executeNpmCommand('search', ['axios || rm']);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Suspicious pattern');
    });

    it('should handle non-zero exit code', async () => {
      const promise = executeNpmCommand('search', ['nonexistent']);
      mockProcess.simulateFailure(1, 'ERR: not found');

      const result = await promise;

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('ERR: not found');
    });

    it('should handle spawn error', async () => {
      const promise = executeNpmCommand('search', ['axios']);
      mockProcess.simulateError(new Error('ENOENT: npm not found'));

      const result = await promise;

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('ENOENT: npm not found');
    });

    it('should handle timeout', async () => {
      vi.useFakeTimers();

      const promise = executeNpmCommand('search', ['axios'], { timeout: 1000 });
      mockProcess.simulateTimeout();

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Command timeout');
      expect(mockProcess.killed).toBe(true);

      vi.useRealTimers();
    });

    it('should remove dangerous environment variables', async () => {
      const promise = executeNpmCommand('search', ['axios']);
      mockProcess.simulateSuccess('[]');

      await promise;

      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const spawnOptions = spawnCall?.[2];

      expect(spawnOptions?.env?.NODE_OPTIONS).toBeUndefined();
      expect(spawnOptions?.env?.NPM_CONFIG_SCRIPT_SHELL).toBeUndefined();
    });

    it('should allow all valid npm commands', async () => {
      const validCommands = ['view', 'search', 'ping', 'config', 'whoami'];

      for (const cmd of validCommands) {
        const promise = executeNpmCommand(cmd as 'search', ['test']);
        mockProcess.simulateSuccess('result');
        await promise;

        // Verify spawn was called (no early error return)
        expect(vi.mocked(spawn)).toHaveBeenCalled();
        vi.clearAllMocks();
        mockProcess = new MockChildProcess();
        vi.mocked(spawn).mockReturnValue(
          mockProcess as unknown as ChildProcess
        );
      }
    });

    it('should escape shell special characters in arguments', async () => {
      const promise = executeNpmCommand('search', ['package$name']);
      mockProcess.simulateSuccess('[]');

      await promise;

      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const args = spawnCall?.[1];

      // Verify dollar sign is escaped
      expect(args).toContain('package\\$name');
    });

    it('should accumulate stdout from multiple data events', async () => {
      const promise = executeNpmCommand('search', ['axios']);

      setTimeout(() => {
        mockProcess.stdout.emit('data', '[{"name":');
        mockProcess.stdout.emit('data', '"axios"}]');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;

      expect(result.stdout).toBe('[{"name":"axios"}]');
    });

    it('should accumulate stderr from multiple data events', async () => {
      const promise = executeNpmCommand('search', ['test']);

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'warn: ');
        mockProcess.stderr.emit('data', 'some warning');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;

      expect(result.stderr).toBe('warn: some warning');
    });
  });

  describe('checkNpmAvailability', () => {
    let mockProcess: MockChildProcess;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
      mockProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
    });

    it('should return true when npm ping succeeds', async () => {
      const promise = checkNpmAvailability();
      mockProcess.simulateSuccess('Ping success: {}');

      const result = await promise;

      expect(result).toBe(true);
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        'npm',
        ['ping'],
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });

    it('should return false when npm ping fails with non-zero exit code', async () => {
      const promise = checkNpmAvailability();
      mockProcess.simulateFailure(1, 'ERR! ping failed');

      const result = await promise;

      expect(result).toBe(false);
    });

    it('should return false when npm ping encounters an error', async () => {
      const promise = checkNpmAvailability();
      mockProcess.simulateError(new Error('ENOENT: npm not found'));

      const result = await promise;

      expect(result).toBe(false);
    });

    it('should return false when npm ping times out', async () => {
      vi.useFakeTimers();

      const promise = checkNpmAvailability(5000);
      mockProcess.simulateTimeout();

      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;

      expect(result).toBe(false);
      expect(mockProcess.killed).toBe(true);

      vi.useRealTimers();
    });

    it('should use custom timeout when provided', async () => {
      const promise = checkNpmAvailability(15000);
      mockProcess.simulateSuccess('Ping success');

      await promise;

      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        'npm',
        ['ping'],
        expect.objectContaining({
          timeout: 15000,
        })
      );
    });

    it('should use default timeout of 10 seconds', async () => {
      const promise = checkNpmAvailability();
      mockProcess.simulateSuccess('Ping success');

      await promise;

      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        'npm',
        ['ping'],
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });
  });
});
