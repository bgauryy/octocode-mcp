import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';
import {
  spawnWithTimeout,
  spawnCollectStdout,
} from '../../src/utils/exec/spawn.js';

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill() {
    this.killed = true;
    return true;
  }
}

describe('spawnWithTimeout - no double timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT pass timeout to spawn options (avoids double timeout)', async () => {
    const mockProcess = new MockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);

    const promise = spawnWithTimeout('test-cmd', ['arg1'], { timeout: 5000 });

    // Let the process exit normally
    setTimeout(() => mockProcess.emit('close', 0), 10);
    await vi.runAllTimersAsync();
    await promise;

    const spawnOptions = vi.mocked(spawn).mock.calls[0]?.[2];

    // The spawn options should NOT include a timeout property.
    // spawnWithTimeout manages its own timeout via setTimeout with
    // SIGTERM -> SIGKILL escalation. Passing timeout to spawn() creates
    // a double timeout race: Node's built-in timeout fires SIGTERM at the
    // same instant our manual timer does, causing unpredictable behavior.
    expect(spawnOptions).not.toHaveProperty('timeout');
  });

  it('should handle timeout entirely via manual setTimeout (SIGTERM->SIGKILL)', async () => {
    const mockProcess = new MockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);

    const promise = spawnWithTimeout('slow-cmd', [], { timeout: 1000 });

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(1001);

    const result = await promise;

    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
    expect(mockProcess.killed).toBe(true);
  });
});

describe('spawnCollectStdout - OOM and timeout coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should kill process and return null when stdout exceeds maxOutputSize', async () => {
    const mockProcess = new MockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);

    const promise = spawnCollectStdout('large-cmd', [], 5000, {
      maxOutputSize: 100,
    });

    // Emit data larger than maxOutputSize
    setTimeout(() => {
      mockProcess.stdout.emit('data', Buffer.alloc(200, 'x'));
    }, 0);

    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(result).toBeNull();
    expect(mockProcess.killed).toBe(true);
  });

  it('should return null on timeout', async () => {
    const mockProcess = new MockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);

    const promise = spawnCollectStdout('hanging-cmd', [], 500);

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(501);

    const result = await promise;
    expect(result).toBeNull();
    expect(mockProcess.killed).toBe(true);
  });
});
