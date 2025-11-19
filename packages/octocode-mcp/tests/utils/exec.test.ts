import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { getGithubCLIToken, parseExecResult } from '../../src/utils/exec';

// Mock child_process
vi.mock('child_process');
const mockSpawn = vi.mocked(spawn);

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
      mockProcess = new MockChildProcess();
      mockSpawn.mockReturnValue(mockProcess as unknown as ChildProcess);
    });

    it('should return token on successful auth', async () => {
      const promise = getGithubCLIToken();
      mockProcess.simulateSuccess(
        'ghp_1234567890abcdef1234567890abcdef12345678\n'
      );

      const result = await promise;

      expect(result).toBe('ghp_1234567890abcdef1234567890abcdef12345678');
      expect(mockSpawn).toHaveBeenCalledWith(
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

      // Fast-forward past timeout
      vi.advanceTimersByTime(10000);

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

      const spawnCall = mockSpawn.mock.calls[0];
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
});
