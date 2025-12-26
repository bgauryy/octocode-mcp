/**
 * Integration test demonstrating execution context security
 */

import { describe, it, expect, vi } from 'vitest';

// Unmock child_process for integration tests - we need real command execution
vi.unmock('child_process');

import path from 'path';
import { safeExec } from '../../src/utils/local/utils/exec.js';

describe('safeExec execution context security', () => {
  const workspaceRoot = process.cwd();
  const parentDir = path.dirname(workspaceRoot);

  it('should allow execution within workspace', async () => {
    // This should work - executing in workspace
    const result = await safeExec('ls', ['-la'], {
      cwd: workspaceRoot,
    });
    expect(result.success).toBe(true);
  });

  it('should allow execution in subdirectory of workspace', async () => {
    // This should work - executing in workspace subdirectory
    const srcPath = path.join(workspaceRoot, 'src');
    const result = await safeExec('ls', ['-la'], {
      cwd: srcPath,
    });
    expect(result.success).toBe(true);
  });

  it('should prevent execution in parent directory', async () => {
    // This should FAIL - attempting to execute outside workspace
    await expect(async () => {
      await safeExec('ls', ['-la'], {
        cwd: parentDir,
      });
    }).rejects.toThrow('Execution context validation failed');
  });

  it('should prevent execution with path traversal', async () => {
    // This should FAIL - attempting to traverse outside workspace
    await expect(async () => {
      await safeExec('ls', ['-la'], {
        cwd: '../../../../',
      });
    }).rejects.toThrow('Can only execute commands within workspace directory');
  });

  it('should prevent execution in system directories', async () => {
    // This should FAIL - attempting to execute in /etc
    await expect(async () => {
      await safeExec('ls', ['-la'], {
        cwd: '/etc',
      });
    }).rejects.toThrow('Can only execute commands within workspace directory');
  });

  it('should allow execution with undefined cwd (defaults to safe)', async () => {
    // This should work - undefined cwd is safe (uses process.cwd())
    const result = await safeExec('ls', ['-la']);
    expect(result.success).toBe(true);
  });
});
