/**
 * Extended tests for exec utilities
 * Covers timeout handling and error handling for safeExec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeExec } from '../../utils/exec.js';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock validators
vi.mock('../../security/commandValidator.js', () => ({
  validateCommand: vi.fn().mockReturnValue({ isValid: true }),
}));

vi.mock('../../security/executionContextValidator.js', () => ({
  validateExecutionContext: vi.fn().mockReturnValue({ isValid: true }),
}));

interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
}

function createMockChild(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.exitCode = null;
  return child;
}

function asMockChildProcess(mock: MockChildProcess): ChildProcess {
  return mock as unknown as ChildProcess;
}

describe('exec - extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('safeExec - timeout handling', () => {
    it('should timeout and kill process after specified timeout', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('ls', ['-la'], { timeout: 1000 });

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(1000);

      await expect(execPromise).rejects.toThrow('Command timeout after 1000ms');
      expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('should not timeout if command completes in time', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('ls', ['-la'], { timeout: 5000 });

      // Emit data and close before timeout
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);

      const result = await execPromise;

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('output');
    });

    it('should clear timeout when process closes', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('ls', ['-la'], { timeout: 5000 });

      // Close immediately
      mockChild.emit('close', 0);

      await execPromise;

      // Advance time past timeout - should not throw
      vi.advanceTimersByTime(10000);
    });

    it('should use default timeout when not specified', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('ls', ['-la']);

      // Advance to default timeout (30000ms)
      vi.advanceTimersByTime(30000);

      await expect(execPromise).rejects.toThrow(
        'Command timeout after 30000ms'
      );
    });
  });

  describe('safeExec - error handling', () => {
    it('should handle spawn error event', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('nonexistent', ['arg']);

      // Emit error
      mockChild.emit('error', new Error('spawn ENOENT'));

      await expect(execPromise).rejects.toThrow('spawn ENOENT');
    });

    it('should not emit error after being killed', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('ls', ['-la'], { maxOutputSize: 10 });

      // Exceed output size to trigger kill
      mockChild.stdout.emit('data', Buffer.from('x'.repeat(20)));

      await expect(execPromise).rejects.toThrow('Output size limit exceeded');

      // Error after kill should be ignored
      mockChild.emit('error', new Error('EPIPE'));
    });

    it('should handle spawn function throwing', async () => {
      vi.mocked(spawn).mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      await expect(safeExec('ls', ['-la'])).rejects.toThrow(
        "Failed to spawn command 'ls': Spawn failed"
      );
    });
  });

  describe('safeExec - output size limits', () => {
    it('should reject when stdout exceeds limit', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('cat', ['bigfile'], { maxOutputSize: 100 });

      // Exceed stdout limit
      mockChild.stdout.emit('data', Buffer.from('x'.repeat(150)));

      await expect(execPromise).rejects.toThrow('Output size limit exceeded');
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should reject when stderr exceeds limit', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('cmd', ['arg'], { maxOutputSize: 100 });

      // Exceed stderr limit
      mockChild.stderr.emit('data', Buffer.from('error'.repeat(50)));

      await expect(execPromise).rejects.toThrow(
        'Error output size limit exceeded'
      );
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should accumulate multiple data chunks', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('ls', ['-la']);

      // Emit multiple chunks
      mockChild.stdout.emit('data', Buffer.from('chunk1\n'));
      mockChild.stdout.emit('data', Buffer.from('chunk2\n'));
      mockChild.stderr.emit('data', Buffer.from('warning\n'));
      mockChild.emit('close', 0);

      const result = await execPromise;

      expect(result.stdout).toBe('chunk1\nchunk2\n');
      expect(result.stderr).toBe('warning\n');
    });
  });

  describe('safeExec - command validation', () => {
    it('should reject invalid commands', async () => {
      const { validateCommand } =
        await import('../../security/commandValidator.js');
      vi.mocked(validateCommand).mockReturnValueOnce({
        isValid: false,
        error: 'Command not allowed',
      });

      await expect(safeExec('rm', ['-rf', '/'])).rejects.toThrow(
        'Command validation failed: Command not allowed'
      );
    });

    it('should reject invalid execution context', async () => {
      const { validateExecutionContext } =
        await import('../../security/executionContextValidator.js');
      vi.mocked(validateExecutionContext).mockReturnValueOnce({
        isValid: false,
        error: 'Invalid working directory',
      });

      await expect(safeExec('ls', ['-la'], { cwd: '/etc' })).rejects.toThrow(
        'Execution context validation failed: Invalid working directory'
      );
    });
  });

  describe('safeExec - exit codes', () => {
    it('should return success=false for non-zero exit', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('ls', ['nonexistent']);

      mockChild.stderr.emit('data', Buffer.from('No such file'));
      mockChild.emit('close', 1);

      const result = await execPromise;

      expect(result.success).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe('No such file');
    });

    it('should return success=true for exit code 0', async () => {
      const mockChild = createMockChild();
      vi.mocked(spawn).mockReturnValue(asMockChildProcess(mockChild));

      const execPromise = safeExec('ls', ['-la']);

      mockChild.stdout.emit('data', Buffer.from('file1\nfile2'));
      mockChild.emit('close', 0);

      const result = await execPromise;

      expect(result.success).toBe(true);
      expect(result.code).toBe(0);
    });
  });
});
