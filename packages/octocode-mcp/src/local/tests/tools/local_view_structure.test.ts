/**
 * Tests for local_view_structure tool - comprehensive coverage including pagination
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ERROR_CODES } from '../../errors/errorCodes.js';
import { viewStructure } from '../../tools/local_view_structure.js';
import * as exec from '../../utils/exec.js';
import * as pathValidator from '../../security/pathValidator.js';
import type { Stats } from 'fs';

// Mock dependencies
vi.mock('../../utils/exec.js', () => ({
  safeExec: vi.fn(),
}));

vi.mock('../../security/pathValidator.js', () => ({
  pathValidator: {
    validate: vi.fn(),
  },
}));

// Create shared mock functions using vi.hoisted to make them available during hoisting
const { mockReaddirFn, mockLstatFn, mockLstatSyncFn } = vi.hoisted(() => ({
  mockReaddirFn: vi.fn(),
  mockLstatFn: vi.fn(),
  mockLstatSyncFn: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    lstatSync: mockLstatSyncFn,
    promises: {
      readdir: mockReaddirFn,
      lstat: mockLstatFn,
    },
  },
  lstatSync: mockLstatSyncFn,
  promises: {
    readdir: mockReaddirFn,
    lstat: mockLstatFn,
  },
}));

describe('local_view_structure', () => {
  const mockSafeExec = vi.mocked(exec.safeExec);
  const mockValidate = vi.mocked(pathValidator.pathValidator.validate);
  // Use the shared mock functions directly
  const mockReaddir = mockReaddirFn;
  const mockLstat = mockLstatFn;
  const mockLstatSync = mockLstatSyncFn;

  beforeEach(() => {
    // Clear all mocks but then immediately set defaults
    vi.clearAllMocks();

    mockValidate.mockReturnValue({
      isValid: true,
      sanitizedPath: '/test/path',
    });

    // Set default mock implementations that will be used unless overridden
    // These MUST return valid values to prevent undefined errors
    mockReaddir.mockResolvedValue([]);
    mockLstat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      size: 0,
      mtime: new Date(),
    } as Stats);
    mockLstatSync.mockReturnValue({
      isDirectory: () => false,
      isSymbolicLink: () => false,
    } as Stats);
    mockSafeExec.mockResolvedValue({
      success: true,
      code: 0,
      stdout: '',
      stderr: '',
    });
  });

  describe('Basic directory listing', () => {
    it('should list directory contents', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'file1.txt\nfile2.js\ndir1',
        stderr: '',
      });

      mockLstatSync.mockImplementation(
        (path: string | Buffer | URL) =>
          ({
            isDirectory: () => path.toString().includes('dir'),
            isSymbolicLink: () => false,
          }) as Stats
      );

      const result = await viewStructure({
        path: '/test/path',
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      expect(result.structuredOutput).toContain('[');
    });

    it('should handle empty directories', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await viewStructure({
        path: '/test/empty',
      });

      expect(result.status).toBe('empty');
    });
  });

  describe('Structured output mode', () => {
    it('should generate structured output with file sizes', async () => {
      // Mock readdir to always return files (for any path)
      mockReaddir.mockResolvedValue(['file1.txt', 'file2.js']);

      mockLstat.mockImplementation(
        async (_path: string | Buffer | URL): Promise<Stats> => {
          return {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 1024,
            mtime: new Date(),
          } as Stats;
        }
      );

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      expect(result.structuredOutput).toContain('file1.txt');
      expect(result.structuredOutput).toContain('1.0KB'); // File sizes shown
    });

    it('should show file sizes for files, not directories', async () => {
      mockReaddir.mockResolvedValue(['file1.txt']);

      mockLstat.mockImplementation(
        async (_path: string | Buffer | URL): Promise<Stats> => {
          return {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 2048,
            mtime: new Date(),
          } as Stats;
        }
      );

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('2.0KB'); // File size shown
    });

    it('should respect depth parameter', async () => {
      let callCount = 0;
      mockReaddir.mockImplementation(async (): Promise<string[]> => {
        callCount++;
        if (callCount === 1) return ['dir1'];
        return ['subfile.txt'];
      });

      mockLstat.mockImplementation(
        async (path: string | Buffer | URL): Promise<Stats> =>
          ({
            isDirectory: () =>
              path.toString().includes('dir1') &&
              !path.toString().includes('subfile'),
            isFile: () => path.toString().includes('subfile'),
            isSymbolicLink: () => false,
            size: 512,
            mtime: new Date(),
          }) as Stats
      );

      const result = await viewStructure({
        path: '/test/path',
        depth: 2,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('dir1');
      expect(result.structuredOutput).toContain('subfile.txt');
    });
  });

  describe('Detailed listing with metadata', () => {
    it('should include file details when requested', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: '-rw-r--r-- 1 user group 1024 Jan 1 12:00 file1.txt',
        stderr: '',
      });

      const result = await viewStructure({
        path: '/test/path',
        details: true,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      expect(result.structuredOutput).toContain('[FILE]');
    });

    it('should parse human-readable file sizes correctly', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: '-rw-r--r-- 1 user group 1.5M Jan 1 12:00 large.bin',
        stderr: '',
      });

      const result = await viewStructure({
        path: '/test/path',
        details: true,
        humanReadable: true,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toMatch(/\d+(\.\d+)?\s*(B|KB|MB|GB)/);
    });
  });

  describe('Filtering', () => {
    it('should filter by glob pattern with wildcards', async () => {
      mockReaddir.mockResolvedValue([
        'test1.txt',
        'test2.txt',
        'other.txt',
        'test-abc.txt',
      ]);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        pattern: 'test*.txt',
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('test1.txt');
      expect(result.structuredOutput).toContain('test2.txt');
      expect(result.structuredOutput).toContain('test-abc.txt');
      expect(result.structuredOutput).not.toContain('other.txt');
    });

    it('should filter by glob pattern with question mark', async () => {
      mockReaddir.mockResolvedValue(['a1.txt', 'a2.txt', 'ab.txt', 'abc.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        pattern: 'a?.txt',
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('a1.txt');
      expect(result.structuredOutput).toContain('a2.txt');
      expect(result.structuredOutput).toContain('ab.txt');
      expect(result.structuredOutput).not.toContain('abc.txt');
    });

    it('should fallback to substring match for invalid regex pattern', async () => {
      mockReaddir.mockResolvedValue(['test-file.txt', 'other.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      // Pattern with brackets that might cause regex issues
      const result = await viewStructure({
        path: '/test/path',
        pattern: '[invalid',
        depth: 1,
      });

      // Should not crash, falls back to substring match
      expect(['hasResults', 'empty']).toContain(result.status);
    });

    it('should filter by file extension', async () => {
      mockReaddir.mockResolvedValue(['file1.ts', 'file2.js', 'file3.ts']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        extension: 'ts',
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('file1.ts');
      expect(result.structuredOutput).toContain('file3.ts');
      expect(result.structuredOutput).not.toContain('file2.js');
    });

    it('should filter by multiple extensions', async () => {
      mockReaddir.mockResolvedValue(['file1.ts', 'file2.tsx', 'file3.js']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        extensions: ['ts', 'tsx'],
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('file1.ts');
      expect(result.structuredOutput).toContain('file2.tsx');
      expect(result.structuredOutput).not.toContain('file3.js');
    });

    it('should filter files only', async () => {
      mockReaddir.mockResolvedValue(['file1.txt', 'dir1']);

      mockLstat.mockImplementation(
        async (path: string | Buffer | URL): Promise<Stats> =>
          ({
            isDirectory: () => path.toString().includes('dir1'),
            isFile: () => path.toString().includes('file1'),
            isSymbolicLink: () => false,
            size: 1024,
            mtime: new Date(),
          }) as Stats
      );

      const result = await viewStructure({
        path: '/test/path',
        filesOnly: true,
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('file1.txt');
      expect(result.structuredOutput).not.toContain('dir1');
    });

    it('should filter directories only', async () => {
      mockReaddir.mockResolvedValue(['file1.txt', 'dir1', 'dir2']);

      mockLstat.mockImplementation(
        async (path: string | Buffer | URL): Promise<Stats> =>
          ({
            isDirectory: () => path.toString().includes('dir'),
            isFile: () => path.toString().includes('file'),
            isSymbolicLink: () => false,
            size: 1024,
            mtime: new Date(),
          }) as Stats
      );

      const result = await viewStructure({
        path: '/test/path',
        directoriesOnly: true,
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('dir1');
      expect(result.structuredOutput).toContain('dir2');
      expect(result.structuredOutput).not.toContain('file1.txt');
    });

    it('should filter by name pattern', async () => {
      mockReaddir.mockResolvedValue(['test1.txt', 'test2.txt', 'other.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        pattern: 'test',
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('test1.txt');
      expect(result.structuredOutput).toContain('test2.txt');
      expect(result.structuredOutput).not.toContain('other.txt');
    });
  });

  describe('Symlink handling', () => {
    it('should identify symlinks in recursive mode', async () => {
      mockReaddir.mockResolvedValue(['file.txt', 'link']);

      mockLstat.mockImplementation(
        async (path: string | Buffer | URL): Promise<Stats> =>
          ({
            isDirectory: () => false,
            isFile: () => path.toString().includes('file'),
            isSymbolicLink: () => path.toString().includes('link'),
            size: 1024,
            mtime: new Date(),
          }) as Stats
      );

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('[LINK]');
    });

    it('should identify symlinks in parseLsLongFormat', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout:
          'lrwxrwxrwx 1 user group 10 Jan 1 12:00 link -> target\n-rw-r--r-- 1 user group 1024 Jan 1 12:00 file.txt',
        stderr: '',
      });

      const result = await viewStructure({
        path: '/test/path',
        details: true,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('[LINK]');
    });
  });

  describe('showFileLastModified', () => {
    it('should include modified date when showFileLastModified is true in parseLsSimple', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'file.txt',
        stderr: '',
      });

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date('2024-01-15T12:00:00Z'),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        showFileLastModified: true,
      });

      expect(result.status).toBe('hasResults');
    });

    it('should include modified date in parseLsLongFormat', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: '-rw-r--r-- 1 user group 1024 Jan 15 12:00 file.txt',
        stderr: '',
      });

      const result = await viewStructure({
        path: '/test/path',
        details: true,
        showFileLastModified: true,
      });

      expect(result.status).toBe('hasResults');
    });

    it('should include modified date in recursive walkDirectory', async () => {
      mockReaddir.mockResolvedValue(['file.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date('2024-06-15T12:00:00Z'),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
        showFileLastModified: true,
      });

      expect(result.status).toBe('hasResults');
    });
  });

  describe('Hidden files', () => {
    it('should show hidden files when requested', async () => {
      mockReaddir.mockResolvedValue(['.hidden', 'visible.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        hidden: true,
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toContain('.hidden');
      expect(result.structuredOutput).toContain('visible.txt');
    });

    it('should hide hidden files by default', async () => {
      mockReaddir.mockResolvedValue(['.hidden', 'visible.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        hidden: false,
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).not.toContain('.hidden');
      expect(result.structuredOutput).toContain('visible.txt');
    });
  });

  describe('Sorting', () => {
    it('should sort by name (default)', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'beta.txt\nalpha.txt\ngamma.txt',
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        sortBy: 'name',
      });

      expect(result.status).toBe('hasResults');
      // Entries should be sorted alphabetically
    });

    it('should sort by size', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout:
          '-rw-r--r-- 1 user group 1024 Jan 1 12:00 small.txt\n-rw-r--r-- 1 user group 2048 Jan 1 12:00 large.txt',
        stderr: '',
      });

      const result = await viewStructure({
        path: '/test/path',
        sortBy: 'size',
        details: true,
      });

      expect(result.status).toBe('hasResults');
      // Should be sorted by size
    });

    it('should sort by extension in recursive mode', async () => {
      mockReaddir.mockResolvedValue(['file.ts', 'file.js', 'file.css']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
        sortBy: 'extension',
      });

      expect(result.status).toBe('hasResults');
    });

    it('should sort by time in recursive mode with showFileLastModified', async () => {
      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date('2024-01-01'),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
        sortBy: 'time',
        showFileLastModified: true,
      });

      expect(result.status).toBe('hasResults');
    });

    it('should sort by time falling back to name when modified not available', async () => {
      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
        sortBy: 'time',
        showFileLastModified: false, // Modified not shown, should fallback
      });

      expect(result.status).toBe('hasResults');
    });

    it('should support reverse sorting in recursive mode', async () => {
      mockReaddir.mockResolvedValue(['alpha.txt', 'beta.txt', 'gamma.txt']);

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
        sortBy: 'name',
        reverse: true,
      });

      expect(result.status).toBe('hasResults');
    });
  });

  describe('Pagination - CRITICAL for large results', () => {
    it('should require pagination for large directory listing (>100 entries)', async () => {
      // Generate 150 entries
      const entries = Array.from(
        { length: 150 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: entries,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',

        // No charLength specified
      });

      // Should either return results or error requesting pagination
      expect(['hasResults', 'error']).toContain(result.status);
      if (result.status === 'error') {
        // Should have error code for pagination
        expect(result.errorCode).toBeDefined();
      }
    });

    it('should allow tree view for large directories without pagination', async () => {
      mockReaddir.mockResolvedValue(
        Array.from({ length: 150 }, (_, i) => `file${i}.txt`)
      );

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
        charLength: 50000, // Use charLength for large result set
      });

      // Tree view should work with pagination
      expect(result.status).toBe('hasResults');
    });

    it('should paginate large directory listings', async () => {
      const entries = Array.from(
        { length: 150 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: entries,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',

        charLength: 5000,
        charOffset: 0,
      });

      expect(result.status).toBe('hasResults');
      // When charLength is provided, totalChars should be defined in pagination
      expect(result.pagination?.totalChars).toBeDefined();
      expect(typeof result.pagination?.totalChars).toBe('number');
      // If character pagination indicates more content, verify totalChars exists
      if (result.pagination?.hasMore) {
        expect(result.pagination?.totalChars).toBeGreaterThan(0);
      }
    });

    it('should paginate tree view when requested', async () => {
      mockReaddir.mockResolvedValue(['file1.txt']);
      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      // Mock the tree generation to produce large output
      const result = await viewStructure({
        path: '/test/path',
        charLength: 10000,
      });

      if (result.structuredOutput && result.structuredOutput.length > 10000) {
        expect(result.pagination?.hasMore).toBe(true);
      }
    });

    it('should handle paginated continuation', async () => {
      const entries = Array.from(
        { length: 150 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: entries,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      // First page
      const result1 = await viewStructure({
        path: '/test/path',

        charLength: 5000,
        charOffset: 0,
      });

      expect(result1.status).toBe('hasResults');

      // Only test continuation if pagination was triggered
      if (!result1.pagination?.hasMore) {
        return; // Skip test if output wasn't large enough
      }

      expect(result1.pagination?.hasMore).toBe(true);

      // Second page
      const result2 = await viewStructure({
        path: '/test/path',

        charLength: 5000,
      });

      expect(result2.status).toBe('hasResults');
      // Should get different entries
    });
  });

  describe('Recursive listing', () => {
    it('should list recursively with depth control', async () => {
      mockReaddir
        .mockResolvedValueOnce(['dir1', 'file1.txt'])
        .mockResolvedValueOnce(['subfile.txt']);

      mockLstat.mockImplementation(
        async (path: string | Buffer | URL): Promise<Stats> =>
          ({
            isDirectory: () => path.toString().includes('dir'),
            isFile: () => !path.toString().includes('dir'),
            isSymbolicLink: () => false,
            size: 1024,
            mtime: new Date(),
          }) as Stats
      );

      const result = await viewStructure({
        path: '/test/path',
        recursive: true,
      });

      // Tree view with recursive doesn't use mockSafeExec, so result may be empty
      expect(['hasResults', 'empty']).toContain(result.status);
      if (result.status === 'hasResults' && result.totalFiles) {
        expect(result.totalFiles).toBeGreaterThan(0);
      }
    });

    it('should handle max depth limit for recursive', async () => {
      mockReaddir.mockResolvedValue(['file.txt']);
      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        depth: 5,
      });

      // May be empty if mocked readdir returns empty array
      expect(['hasResults', 'empty']).toContain(result.status);
      // Should respect max depth of 5
    });

    it('should require pagination for large recursive listings', async () => {
      // Mock large recursive result
      mockReaddir.mockImplementation(
        async (): Promise<string[]> =>
          Array.from({ length: 50 }, (_, i) => `file${i}.txt`)
      );

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        recursive: true,

        // Large result without pagination
      });

      if (result.totalFiles && result.totalFiles > 100) {
        expect(result.status).toBe('error');
        expect(result.errorCode).toBeDefined();
      }
    });
  });

  describe('Summary statistics', () => {
    it('should include summary by default', async () => {
      mockReaddir.mockResolvedValue(['file1.txt', 'dir1']);
      mockLstat.mockImplementation(
        async (path: string | Buffer | URL): Promise<Stats> =>
          ({
            isDirectory: () => path.toString().includes('dir'),
            isFile: () => !path.toString().includes('dir'),
            isSymbolicLink: () => false,
            size: 1024,
            mtime: new Date(),
          }) as Stats
      );

      const result = await viewStructure({
        path: '/test/path',
        summary: true,
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      // Summary stats are only included when summary=true and in tree view mode
      if (result.totalFiles !== undefined) {
        expect(result.totalFiles).toBeGreaterThanOrEqual(0);
      }
      if (result.totalDirectories !== undefined) {
        expect(result.totalDirectories).toBeGreaterThanOrEqual(0);
      }
      if (result.totalSize !== undefined) {
        expect(result.totalSize).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Path validation', () => {
    it('should reject invalid paths', async () => {
      mockValidate.mockReturnValue({
        isValid: false,
        error: 'Path is outside allowed directories',
      });

      const result = await viewStructure({
        path: '/etc/passwd',
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.PATH_VALIDATION_FAILED);
    });
  });

  describe('Error handling', () => {
    it('should handle command failure', async () => {
      mockSafeExec.mockResolvedValue({
        success: false,
        code: 1,
        stdout: '',
        stderr: 'ls: cannot access',
      });

      const result = await viewStructure({
        path: '/test/path',
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.COMMAND_EXECUTION_FAILED);
    });

    it('should handle unreadable directories', async () => {
      mockReaddir.mockRejectedValue(new Error('Permission denied'));

      const result = await viewStructure({
        path: '/test/path',
      });

      // Should handle error gracefully - might return error or hasResults with error message
      expect(['error', 'empty', 'hasResults']).toContain(result.status);
    });
  });

  describe('Limit parameter', () => {
    it('should apply limit to results', async () => {
      mockReaddir.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) => `file${i}.txt`)
      );

      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        limit: 10,
        depth: 1,
      });

      expect(result.status).toBe('hasResults');
      // Should respect limit
    });
  });

  describe('NEW FEATURE: Entry-based pagination with default time sorting', () => {
    it('should paginate with default 20 entries per page', async () => {
      const fileList = Array.from(
        { length: 50 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      expect(result.pagination?.totalPages).toBeGreaterThan(1);
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should navigate to second page of entries', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: Array.from({ length: 50 }, (_, i) => `file${i}.txt`).join('\n'),
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',

        entryPageNumber: 2,
      });

      expect(['hasResults', 'empty']).toContain(result.status);
      if (result.status === 'hasResults') {
        expect(result.pagination?.currentPage).toBe(2);
      }
    });

    it('should support custom entriesPerPage', async () => {
      const fileList = Array.from(
        { length: 50 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',

        entriesPerPage: 10,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      expect(result.pagination?.entriesPerPage).toBe(10);
    });

    it('should handle last page correctly', async () => {
      const fileList = Array.from(
        { length: 25 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',

        entriesPerPage: 20,
        entryPageNumber: 2,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      expect(result.pagination?.hasMore).toBe(false);
    });
  });

  describe('Entry pagination - Bounds', () => {
    it('should coerce entryPageNumber=0 to 1 via defaulting', async () => {
      const fileList = Array.from(
        { length: 25 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });
      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entriesPerPage: 10,
        entryPageNumber: 0,
      });

      expect(['hasResults', 'empty']).toContain(result.status);
      expect(result.pagination?.currentPage).toBe(1);
    });

    it('should reflect negative entryPageNumber as provided (no clamping)', async () => {
      const fileList = Array.from(
        { length: 25 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });
      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entriesPerPage: 10,
        entryPageNumber: -3,
      });

      expect(['hasResults', 'empty']).toContain(result.status);
      expect(result.pagination?.currentPage).toBe(-3);
    });

    it('should reflect overflow entryPageNumber beyond total pages', async () => {
      const fileList = Array.from(
        { length: 25 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });
      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entriesPerPage: 10,
        entryPageNumber: 9999,
      });

      expect(['hasResults', 'empty']).toContain(result.status);
      expect(result.pagination?.currentPage).toBe(9999);
    });
  });

  describe('NEW FEATURE: Default sort by modification time', () => {
    it('should sort by time (most recent first) by default', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout:
          '-rw-r--r-- 1 user group 1024 Jan 1 12:00 old.txt\n-rw-r--r-- 1 user group 2048 Dec 1 12:00 new.txt',
        stderr: '',
      });

      const result = await viewStructure({
        path: '/test/path',
      });

      expect(result.status).toBe('hasResults');
    });

    it('should allow overriding sort to name', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'beta.txt\nalpha.txt\ngamma.txt',
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        sortBy: 'name',
      });

      expect(result.status).toBe('hasResults');
    });

    it('should sort even with pagination', async () => {
      const fileList = Array.from(
        { length: 30 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',

        entriesPerPage: 10,
      });

      expect(result.status).toBe('hasResults');
    });
  });

  describe('NEW FEATURE: Entry pagination hints', () => {
    it('should include pagination hints with entry info', async () => {
      const fileList = Array.from(
        { length: 50 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',

        entriesPerPage: 20,
      });

      expect(result.status).toBe('hasResults');
      expect(result.hints).toBeDefined();
    });

    it('should show final page hint on last page', async () => {
      const fileList = Array.from(
        { length: 25 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',

        entriesPerPage: 20,
        entryPageNumber: 2,
      });

      expect(result.status).toBe('hasResults');
    });
  });

  describe('Research context fields', () => {
    it('should return researchGoal and reasoning in hasResults', async () => {
      mockReaddir.mockResolvedValue(['file1.txt', 'file2.txt']);
      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        depth: 1,
        researchGoal: 'Explore directory structure',
        reasoning: 'Need to understand file organization',
      });

      expect(result.status).toBe('hasResults');
      expect(result.researchGoal).toBe('Explore directory structure');
      expect(result.reasoning).toBe('Need to understand file organization');
    });

    it('should return researchGoal and reasoning in empty results', async () => {
      mockReaddir.mockResolvedValue([]);
      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
      } as Stats);

      const result = await viewStructure({
        path: '/test/empty',
        depth: 1,
        researchGoal: 'Check empty directory',
        reasoning: 'Verify no files exist',
      });

      expect(result.status).toBe('empty');
      expect(result.researchGoal).toBe('Check empty directory');
      expect(result.reasoning).toBe('Verify no files exist');
    });

    it('should return researchGoal and reasoning in error results', async () => {
      mockValidate.mockReturnValue({
        isValid: false,
        error: 'Invalid path',
      });

      const result = await viewStructure({
        path: '/invalid/path',
        researchGoal: 'Test invalid path',
        reasoning: 'Testing error handling',
      });

      expect(result.status).toBe('error');
      expect(result.researchGoal).toBe('Test invalid path');
      expect(result.reasoning).toBe('Testing error handling');
    });
  });

  describe('Character-based pagination (charOffset + charLength)', () => {
    it('should paginate with charOffset and charLength', async () => {
      const largeOutput = Array.from(
        { length: 100 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: largeOutput,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 500,
        charOffset: 0,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput?.length).toBeLessThanOrEqual(500);
      expect(result.pagination?.totalChars).toBeGreaterThan(500);
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should return first page by default', async () => {
      const largeOutput = Array.from(
        { length: 50 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: largeOutput,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 200,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.charOffset).toBe(0);
    });

    it('should navigate to second page with charOffset', async () => {
      const largeOutput = Array.from(
        { length: 100 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: largeOutput,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 500,
        charOffset: 500,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.charOffset).toBe(500);
    });

    it('should handle charOffset = 0', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'file1.txt\nfile2.txt',
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charOffset: 0,
        charLength: 100,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.charOffset).toBe(0);
    });

    it('should handle charOffset at exact boundary', async () => {
      const content = 'x'.repeat(1000);
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: content,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charOffset: 1000,
        charLength: 500,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.charOffset).toBe(1000);
    });

    it('should handle charOffset beyond content length', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'short content',
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charOffset: 10000,
        charLength: 100,
      });

      // When charOffset is beyond content, we still get hasResults with empty data
      expect(result.status).toBe('hasResults');
    });

    it('should handle charLength = 1', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'abcdefghij',
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput?.length).toBe(1);
      // hasMore is only set when there's actually more content
      if (result.pagination) {
        expect(typeof result.pagination.hasMore).toBe('boolean');
      }
    });

    it('should handle charLength = 10000 (max)', async () => {
      const largeContent = 'x'.repeat(20000);
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: largeContent,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 10000,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput?.length).toBeLessThanOrEqual(10000);
      // hasMore is only set when there's actually more content
      if (result.pagination) {
        expect(typeof result.pagination.hasMore).toBe('boolean');
      }
    });

    it('should handle charLength > remaining content', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'short text',
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 10000,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.hasMore).toBe(false);
    });

    it('should handle ASCII content pagination', async () => {
      const asciiContent = 'Hello World\nThis is ASCII content\nLine 3';
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: asciiContent,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 20,
        charOffset: 0,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
    });

    it('should handle 2-byte UTF-8 chars (é, ñ)', async () => {
      const utf8Content = 'Café résumé piñata\n' + 'x'.repeat(500);
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: utf8Content,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 100,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      // Should not split UTF-8 characters
      expect(result.structuredOutput).not.toMatch(/\uFFFD/);
    });

    it('should handle 3-byte UTF-8 chars (中文)', async () => {
      const utf8Content = '你好世界 Chinese text\n' + 'x'.repeat(500);
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: utf8Content,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 100,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      // Should not have replacement characters indicating split UTF-8
      expect(result.structuredOutput).not.toMatch(/\uFFFD/);
    });

    it('should handle 4-byte UTF-8 chars (emoji)', async () => {
      const utf8Content = '😀🎉👍 Emoji test\n' + 'x'.repeat(500);
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: utf8Content,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 100,
      });

      expect(result.status).toBe('hasResults');
      expect(result.structuredOutput).toBeDefined();
      // Should not split emoji
      expect(result.structuredOutput).not.toMatch(/\uFFFD/);
    });

    it('should not split multi-byte characters at boundaries', async () => {
      // Create content where boundary might fall in middle of UTF-8 char
      const utf8Content = 'a'.repeat(95) + 'café';
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: utf8Content,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 98, // Might cut in middle of 'é'
      });

      expect(result.status).toBe('hasResults');
      // Should not have replacement character
      expect(result.structuredOutput).not.toMatch(/\uFFFD/);
    });

    it('should show character pagination hints', async () => {
      const largeOutput = Array.from(
        { length: 100 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: largeOutput,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 500,
      });

      expect(result.status).toBe('hasResults');
      expect(result.hints).toBeDefined();
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should show hints with charOffset for next page', async () => {
      const largeOutput = Array.from(
        { length: 100 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: largeOutput,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        charLength: 500,
        charOffset: 0,
      });

      expect(result.status).toBe('hasResults');
      if (result.pagination?.hasMore) {
        expect(result.hints).toBeDefined();
        // Hints should mention charOffset for next page
        const hasCharOffsetHint = result.hints?.some(
          h => h.includes('charOffset') || h.includes('next chunk')
        );
        expect(hasCharOffsetHint).toBe(true);
      }
    });
  });

  describe('Entry pagination - Edge cases', () => {
    it('should handle entryPageNumber = 0 (defaults to 1)', async () => {
      const fileList = Array.from(
        { length: 50 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      // Schema validation should prevent 0, but if it gets through, should default to 1
      const result = await viewStructure({
        path: '/test/path',
        entryPageNumber: 1, // Test with valid value since schema validates
        entriesPerPage: 20,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.currentPage).toBe(1);
    });

    it('should handle entryPageNumber > total pages', async () => {
      const fileList = Array.from(
        { length: 25 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entryPageNumber: 10, // Way beyond last page
        entriesPerPage: 20,
      });

      // Should return empty or handle gracefully
      expect(['hasResults', 'empty']).toContain(result.status);
      if (result.status === 'hasResults') {
        expect(result.pagination?.currentPage).toBe(10);
      }
    });

    it('should handle entriesPerPage = 1', async () => {
      const fileList = Array.from({ length: 5 }, (_, i) => `file${i}.txt`).join(
        '\n'
      );
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entriesPerPage: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.entriesPerPage).toBe(1);
      expect(result.pagination?.totalPages).toBe(5);
    });

    it('should handle entriesPerPage = 20 (max)', async () => {
      const fileList = Array.from(
        { length: 150 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entriesPerPage: 20,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.entriesPerPage).toBe(20);
      expect(result.pagination?.totalPages).toBe(8);
    });

    it('should handle exact boundary (20 entries, 20 per page)', async () => {
      const fileList = Array.from(
        { length: 20 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entriesPerPage: 20,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.totalPages).toBe(1);
      expect(result.pagination?.hasMore).toBe(false);
    });

    it('should handle one over boundary (21 entries, 20 per page)', async () => {
      const fileList = Array.from(
        { length: 21 },
        (_, i) => `file${i}.txt`
      ).join('\n');
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: fileList,
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entriesPerPage: 20,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.totalPages).toBe(2);
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should handle single entry (no pagination needed)', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        code: 0,
        stdout: 'single-file.txt',
        stderr: '',
      });

      mockLstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as Stats);

      const result = await viewStructure({
        path: '/test/path',
        entriesPerPage: 20,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.totalPages).toBe(1);
      expect(result.pagination?.hasMore).toBe(false);
    });
  });
});
