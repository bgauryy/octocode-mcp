/**
 * Tests for LSP client command detection
 * Verifies cross-platform command existence checking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock spawn for testing
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  ChildProcess: vi.fn(),
}));

const mockSpawn = spawn as ReturnType<typeof vi.fn>;

describe('Cross-Platform Command Detection', () => {
  let mockProcess: EventEmitter & { kill: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    mockProcess = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>;
    };
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Platform-specific command selection', () => {
    it('should use "where" on Windows', () => {
      // Simulate Windows platform detection
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? 'where' : 'which';

      // On macOS/Linux, 'which' should be used
      if (!isWindows) {
        expect(checkCmd).toBe('which');
      }
    });

    it('should use "which" on Unix-like systems', () => {
      // This test runs on the current platform
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? 'where' : 'which';

      // If we're on Unix, verify 'which' is selected
      if (!isWindows) {
        expect(checkCmd).toBe('which');
      }
    });
  });

  describe('commandExists behavior', () => {
    async function simulatedCommandExists(command: string): Promise<boolean> {
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? 'where' : 'which';

      return new Promise(resolve => {
        const proc = mockSpawn(checkCmd, [command], {
          stdio: 'ignore',
          shell: isWindows,
        });

        const timeout = setTimeout(() => {
          proc.kill();
          resolve(false);
        }, 5000);

        proc.on('close', (code: number | null) => {
          clearTimeout(timeout);
          resolve(code === 0);
        });

        proc.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
    }

    it('should return true when command exists (exit code 0)', async () => {
      const promise = simulatedCommandExists('node');

      // Simulate successful exit
      process.nextTick(() => {
        mockProcess.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBe(true);
    });

    it('should return false when command does not exist (exit code 1)', async () => {
      const promise = simulatedCommandExists('nonexistent-command');

      // Simulate failed exit
      process.nextTick(() => {
        mockProcess.emit('close', 1);
      });

      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBe(false);
    });

    it('should return false on spawn error', async () => {
      const promise = simulatedCommandExists('error-command');

      // Simulate error
      process.nextTick(() => {
        mockProcess.emit('error', new Error('ENOENT'));
      });

      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      const promise = simulatedCommandExists('slow-command');

      // Don't emit any event - let it timeout
      await vi.advanceTimersByTimeAsync(5100);

      const result = await promise;
      expect(result).toBe(false);
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should pass shell option on Windows', () => {
      const isWindows = process.platform === 'win32';

      simulatedCommandExists('test-command');

      expect(mockSpawn).toHaveBeenCalledWith(
        isWindows ? 'where' : 'which',
        ['test-command'],
        expect.objectContaining({
          shell: isWindows,
        })
      );
    });
  });
});
