import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  executeNpmCommand,
  getGithubCLIToken,
  parseExecResult,
  NpmCommand,
} from '../../src/utils/exec';

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

  describe('executeNpmCommand', () => {
    let mockProcess: MockChildProcess;

    beforeEach(() => {
      mockProcess = new MockChildProcess();
      mockSpawn.mockReturnValue(mockProcess as unknown as ChildProcess);
    });

    describe('Command Validation', () => {
      it('should accept allowed NPM commands', async () => {
        const allowedCommands: NpmCommand[] = [
          'view',
          'search',
          'ping',
          'config',
          'whoami',
        ];

        for (const command of allowedCommands) {
          mockProcess = new MockChildProcess();
          mockSpawn.mockReturnValue(mockProcess as unknown as ChildProcess);

          const promise = executeNpmCommand(command, ['test-package']);
          mockProcess.simulateSuccess('success');

          const result = await promise;
          expect(result.isError).toBe(false);
        }
      });

      it('should reject disallowed commands', async () => {
        const result = await executeNpmCommand('install' as NpmCommand, [
          'package',
        ]);

        expect(result).toEqual({
          isError: true,
          content: [
            {
              type: 'text',
              text: `instructions: "Command 'install' is not allowed"
data:
  error: "Command 'install' is not allowed"
`,
            },
          ],
        });
      });

      it('should validate arguments for security', async () => {
        const testCases = [
          {
            arg: 'package\0null-byte',
            expectedText: `instructions: "Invalid arguments: Null bytes not allowed in arguments"
data:
  error: "Invalid arguments: Null bytes not allowed in arguments"
`,
          },
          {
            arg: 'a'.repeat(1001),
            expectedText: `instructions: "Invalid arguments: Argument too long"
data:
  error: "Invalid arguments: Argument too long"
`,
          },
          {
            arg: '$(malicious)',
            expectedText: `instructions: "Invalid arguments: Suspicious pattern detected in argument: $(malicious)..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: $(malicious)..."
`,
          },
          {
            arg: '`whoami`',
            expectedText: `instructions: "Invalid arguments: Suspicious pattern detected in argument: \`whoami\`..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: \`whoami\`..."
`,
          },
          {
            arg: 'package; rm -rf /',
            expectedText: `instructions: "Invalid arguments: Suspicious pattern detected in argument: package; rm -rf /..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: package; rm -rf /..."
`,
          },
          {
            arg: 'package | cat /etc/passwd',
            expectedText: `instructions: "Invalid arguments: Suspicious pattern detected in argument: package | cat /etc/passwd..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: package | cat /etc/passwd..."
`,
          },
          {
            arg: 'package && evil-command',
            expectedText: `instructions: "Invalid arguments: Suspicious pattern detected in argument: package && evil-command..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: package && evil-command..."
`,
          },
          {
            arg: 'package || evil-command',
            expectedText: `instructions: "Invalid arguments: Suspicious pattern detected in argument: package || evil-command..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: package || evil-command..."
`,
          },
          {
            arg: 'package > /etc/passwd',
            expectedText: `instructions: "Invalid arguments: Suspicious pattern detected in argument: package > /etc/passwd..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: package > /etc/passwd..."
`,
          },
          {
            arg: 'package < /etc/shadow',
            expectedText: `instructions: "Invalid arguments: Suspicious pattern detected in argument: package < /etc/shadow..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: package < /etc/shadow..."
`,
          },
        ];

        for (const testCase of testCases) {
          const result = await executeNpmCommand('view', [testCase.arg]);
          expect(result).toEqual({
            isError: true,
            content: [
              {
                type: 'text',
                text: testCase.expectedText,
              },
            ],
          });
        }
      });
    });

    describe('Argument Sanitization', () => {
      it('should escape dangerous characters', async () => {
        mockProcess = new MockChildProcess();
        mockSpawn.mockReturnValue(mockProcess as unknown as ChildProcess);

        const promise = executeNpmCommand('view', [
          'test$package`with\\dangerous',
        ]);
        mockProcess.simulateSuccess('success');

        await promise;

        // Verify spawn was called with escaped arguments
        expect(mockSpawn).toHaveBeenCalledWith(
          'npm',
          ['view', 'test\\$package\\`with\\\\dangerous'],
          expect.any(Object)
        );
      });

      it('should reject arguments with shell operators', async () => {
        const result = await executeNpmCommand('view', [
          'test;package|with&operators',
        ]);

        expect(result).toEqual({
          isError: true,
          content: [
            {
              type: 'text',
              text: `instructions: "Invalid arguments: Suspicious pattern detected in argument: test;package|with&operators..."
data:
  error: "Invalid arguments: Suspicious pattern detected in argument: test;package|with&operators..."
`,
            },
          ],
        });
        expect(mockSpawn).not.toHaveBeenCalled();
      });

      it('should normalize whitespace', async () => {
        mockProcess = new MockChildProcess();
        mockSpawn.mockReturnValue(mockProcess as unknown as ChildProcess);

        const promise = executeNpmCommand('view', ['  test   package  ']);
        mockProcess.simulateSuccess('success');

        await promise;

        expect(mockSpawn).toHaveBeenCalledWith(
          'npm',
          ['view', 'test package'],
          expect.any(Object)
        );
      });
    });

    describe('Execution Success Cases', () => {
      it('should handle successful command execution', async () => {
        const promise = executeNpmCommand('view', ['test-package']);
        mockProcess.simulateSuccess(
          '{"name":"test-package","version":"1.0.0"}'
        );

        const result = await promise;

        expect(result).toEqual({
          isError: false,
          content: [
            {
              type: 'text',
              text: `data: "{\\"name\\":\\"test-package\\",\\"version\\":\\"1.0.0\\"}"\n`,
            },
          ],
        });
      });

      it('should pass through options correctly', async () => {
        const options = {
          timeout: 5000,
          cwd: '/test/directory',
          env: { CUSTOM_VAR: 'test-value' },
        };

        const promise = executeNpmCommand('view', ['test-package'], options);
        mockProcess.simulateSuccess('success');

        await promise;

        expect(mockSpawn).toHaveBeenCalledWith(
          'npm',
          ['view', 'test-package'],
          expect.objectContaining({
            cwd: '/test/directory',
            env: expect.objectContaining({
              CUSTOM_VAR: 'test-value',
            }),
            timeout: 5000,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
        );
      });

      it('should remove dangerous environment variables', async () => {
        const promise = executeNpmCommand('view', ['test-package']);
        mockProcess.simulateSuccess('success');

        await promise;

        const spawnCall = mockSpawn.mock.calls[0];
        const spawnOptions = spawnCall?.[2];

        expect(spawnOptions?.env?.NODE_OPTIONS).toBeUndefined();
        expect(spawnOptions?.env?.NPM_CONFIG_SCRIPT_SHELL).toBeUndefined();
      });
    });

    describe('Error Handling', () => {
      it('should handle command execution failure', async () => {
        const promise = executeNpmCommand('view', ['nonexistent-package']);
        mockProcess.simulateFailure(1, 'package not found', 'some stdout');

        const result = await promise;

        expect(result).toEqual({
          isError: true,
          content: [
            {
              type: 'text',
              text: `instructions: "Command failed: Process exited with code 1"
data:
  error: true
`,
            },
          ],
        });
      });

      it('should handle spawn errors', async () => {
        const promise = executeNpmCommand('view', ['test-package']);
        mockProcess.simulateError(new Error('ENOENT: command not found'));

        const result = await promise;

        expect(result).toEqual({
          isError: true,
          content: [
            {
              type: 'text',
              text: `instructions: "Command failed: ENOENT: command not found"
data:
  error: true
`,
            },
          ],
        });
      });

      it('should handle timeout', async () => {
        const promise = executeNpmCommand('view', ['test-package'], {
          timeout: 100,
        });
        mockProcess.simulateTimeout();

        const result = await promise;

        expect(result).toEqual({
          isError: true,
          content: [
            {
              type: 'text',
              text: `instructions: "Command failed: Command timeout"
data:
  error: true
`,
            },
          ],
        });
      });

      it('should kill process on timeout', async () => {
        vi.useFakeTimers();

        const promise = executeNpmCommand('view', ['test-package'], {
          timeout: 1000,
        });
        mockProcess.simulateTimeout();

        vi.advanceTimersByTime(1000);

        const result = await promise;

        expect(mockProcess.killed).toEqual(true);
        expect(result).toEqual({
          isError: true,
          content: [
            {
              type: 'text',
              text: `instructions: "Command failed: Command timeout"
data:
  error: true
`,
            },
          ],
        });

        vi.useRealTimers();
      });
    });

    describe('Data Handling', () => {
      it('should accumulate stdout data correctly', async () => {
        const promise = executeNpmCommand('view', ['test-package']);

        setTimeout(() => {
          mockProcess.stdout.emit('data', 'first ');
          mockProcess.stdout.emit('data', 'second ');
          mockProcess.stdout.emit('data', 'third');
          mockProcess.emit('close', 0);
        }, 10);

        const result = await promise;

        expect(result).toEqual({
          isError: false,
          content: [
            {
              type: 'text',
              text: `data: "first second third"\n`,
            },
          ],
        });
      });

      it('should accumulate stderr data correctly', async () => {
        const promise = executeNpmCommand('view', ['test-package']);

        setTimeout(() => {
          mockProcess.stderr.emit('data', 'error ');
          mockProcess.stderr.emit('data', 'message');
          mockProcess.emit('close', 1);
        }, 10);

        const result = await promise;

        expect(result).toEqual({
          isError: true,
          content: [
            {
              type: 'text',
              text: `instructions: "Command failed: Process exited with code 1"
data:
  error: true
`,
            },
          ],
        });
      });

      it('should handle both stdout and stderr', async () => {
        const promise = executeNpmCommand('view', ['test-package']);

        setTimeout(() => {
          mockProcess.stdout.emit('data', 'output data');
          mockProcess.stderr.emit('data', 'warning message');
          mockProcess.emit('close', 0);
        }, 10);

        const result = await promise;

        expect(result).toEqual({
          isError: false,
          content: [
            {
              type: 'text',
              text: `instructions: "Warning: warning message"
data: "output data"
`,
            },
          ],
        });
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

  describe('Integration Tests', () => {
    it('should handle concurrent command executions', async () => {
      const promises = [];
      const processes = [];

      for (let i = 0; i < 3; i++) {
        const process = new MockChildProcess();
        processes.push(process);
        mockSpawn.mockReturnValueOnce(process as unknown as ChildProcess);

        promises.push(executeNpmCommand('view', [`package${i}`]));
      }

      processes.forEach((process, i) => {
        process.simulateSuccess(`result${i}`);
      });

      const results = await Promise.all(promises);

      expect(results).toEqual([
        {
          isError: false,
          content: [
            {
              type: 'text',
              text: `data: "result0"\n`,
            },
          ],
        },
        {
          isError: false,
          content: [
            {
              type: 'text',
              text: `data: "result1"\n`,
            },
          ],
        },
        {
          isError: false,
          content: [
            {
              type: 'text',
              text: `data: "result2"\n`,
            },
          ],
        },
      ]);
    });

    it('should handle mixed success/failure scenarios', async () => {
      const mockProcess1 = new MockChildProcess();
      const mockProcess2 = new MockChildProcess();

      mockSpawn
        .mockReturnValueOnce(mockProcess1 as unknown as ChildProcess)
        .mockReturnValueOnce(mockProcess2 as unknown as ChildProcess);

      const promise1 = executeNpmCommand('view', ['success-package']);
      const promise2 = executeNpmCommand('view', ['fail-package']);

      mockProcess1.simulateSuccess('success data');
      mockProcess2.simulateFailure(1, 'failure message');

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual({
        isError: false,
        content: [
          {
            type: 'text',
            text: `data: "success data"\n`,
          },
        ],
      });

      expect(result2).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: `instructions: "Command failed: Process exited with code 1"
data:
  error: true
`,
          },
        ],
      });
    });
  });
});
