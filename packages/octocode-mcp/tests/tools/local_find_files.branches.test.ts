/**
 * Branch coverage tests for local_find_files/findFiles.ts
 * Targets: sortBy 'size' and 'name' branches (lines 134-139)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { findFiles } from '../../src/tools/local_find_files/index.js';
import * as exec from '../../src/utils/exec/index.js';
import * as pathValidator from '../../src/security/pathValidator.js';

vi.mock('../../src/utils/exec/index.js', () => ({
  safeExec: vi.fn(),
  checkCommandAvailability: vi
    .fn()
    .mockResolvedValue({ available: true, command: 'find' }),
  getMissingCommandError: vi.fn().mockReturnValue('Command not available'),
}));

vi.mock('../../src/security/pathValidator.js', () => ({
  pathValidator: {
    validate: vi.fn(),
  },
}));

vi.mock('fs', () => {
  const lstat = vi.fn();
  return {
    promises: { lstat },
    default: { promises: { lstat } },
  };
});

const mockFs = vi.mocked(await import('fs')) as unknown as {
  promises: { lstat: ReturnType<typeof vi.fn> };
};

const mockSafeExec = vi.mocked(exec.safeExec);
const mockValidate = vi.mocked(pathValidator.pathValidator.validate);

describe('findFiles sortBy branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({
      isValid: true,
      sanitizedPath: '/test',
    });
  });

  it('should sort by size descending when sortBy is "size"', async () => {
    mockSafeExec.mockResolvedValue({
      success: true,
      code: 0,
      stdout: '/test/big.ts\0/test/small.ts\0/test/medium.ts\0',
      stderr: '',
    });

    mockFs.promises.lstat.mockImplementation(async (p: any) => {
      const sizes: Record<string, number> = {
        '/test/big.ts': 5000,
        '/test/small.ts': 100,
        '/test/medium.ts': 2000,
      };
      return {
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: sizes[String(p)] ?? 0,
        mtime: new Date('2024-01-01'),
      };
    });

    const result = await findFiles({
      path: '/test',
      sortBy: 'size',
      details: true,
    });

    expect(result.status).toBe('hasResults');
    const files = result.files!;
    expect(files[0]!.size).toBe(5000);
    expect(files[1]!.size).toBe(2000);
    expect(files[2]!.size).toBe(100);
  });

  it('should sort by name alphabetically when sortBy is "name"', async () => {
    mockSafeExec.mockResolvedValue({
      success: true,
      code: 0,
      stdout: '/test/charlie.ts\0/test/alpha.ts\0/test/bravo.ts\0',
      stderr: '',
    });

    mockFs.promises.lstat.mockImplementation(async () => {
      return {
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 100,
        mtime: new Date('2024-01-01'),
      };
    });

    const result = await findFiles({
      path: '/test',
      sortBy: 'name',
      details: true,
    });

    expect(result.status).toBe('hasResults');
    const files = result.files!;
    expect(files[0]!.path).toContain('alpha');
    expect(files[1]!.path).toContain('bravo');
    expect(files[2]!.path).toContain('charlie');
  });

  it('should sort by path when sortBy is "path"', async () => {
    mockSafeExec.mockResolvedValue({
      success: true,
      code: 0,
      stdout: '/test/z/file.ts\0/test/a/file.ts\0/test/m/file.ts\0',
      stderr: '',
    });

    mockFs.promises.lstat.mockImplementation(async () => {
      return {
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 100,
        mtime: new Date('2024-01-01'),
      };
    });

    const result = await findFiles({
      path: '/test',
      sortBy: 'path',
      details: true,
    });

    expect(result.status).toBe('hasResults');
    const files = result.files!;
    expect(files[0]!.path).toContain('/a/');
    expect(files[1]!.path).toContain('/m/');
    expect(files[2]!.path).toContain('/z/');
  });
});
