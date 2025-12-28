/**
 * File System Utilities Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// Mock node:fs module
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    readdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

describe('File System Utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('dirExists', () => {
    it('should return true for existing directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const { dirExists } = await import('../../src/utils/fs.js');
      expect(dirExists('/path/to/dir')).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { dirExists } = await import('../../src/utils/fs.js');
      expect(dirExists('/path/to/nonexistent')).toBe(false);
    });

    it('should return false for file (not directory)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      const { dirExists } = await import('../../src/utils/fs.js');
      expect(dirExists('/path/to/file')).toBe(false);
    });

    it('should return false on error', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { dirExists } = await import('../../src/utils/fs.js');
      expect(dirExists('/path/to/protected')).toBe(false);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);

      const { fileExists } = await import('../../src/utils/fs.js');
      expect(fileExists('/path/to/file.txt')).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { fileExists } = await import('../../src/utils/fs.js');
      expect(fileExists('/path/to/nonexistent.txt')).toBe(false);
    });

    it('should return false for directory (not file)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => false,
      } as fs.Stats);

      const { fileExists } = await import('../../src/utils/fs.js');
      expect(fileExists('/path/to/dir')).toBe(false);
    });

    it('should return false on error', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { fileExists } = await import('../../src/utils/fs.js');
      expect(fileExists('/path/to/protected.txt')).toBe(false);
    });
  });

  describe('readFileContent', () => {
    it('should return file content for existing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('file content');

      const { readFileContent } = await import('../../src/utils/fs.js');
      expect(readFileContent('/path/to/file.txt')).toBe('file content');
    });

    it('should return null for non-existing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { readFileContent } = await import('../../src/utils/fs.js');
      expect(readFileContent('/path/to/nonexistent.txt')).toBeNull();
    });

    it('should return null on read error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const { readFileContent } = await import('../../src/utils/fs.js');
      expect(readFileContent('/path/to/file.txt')).toBeNull();
    });
  });

  describe('writeFileContent', () => {
    it('should write content to file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const { writeFileContent } = await import('../../src/utils/fs.js');
      const result = writeFileContent('/path/to/file.txt', 'new content');

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/file.txt',
        'new content',
        'utf8'
      );
    });

    it('should create directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => '');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const { writeFileContent } = await import('../../src/utils/fs.js');
      const result = writeFileContent('/path/to/new/file.txt', 'content');

      expect(result).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith('/path/to/new', {
        recursive: true,
      });
    });

    it('should return false on write error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      const { writeFileContent } = await import('../../src/utils/fs.js');
      const result = writeFileContent('/path/to/file.txt', 'content');

      expect(result).toBe(false);
    });
  });

  describe('backupFile', () => {
    it('should create backup of existing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      vi.mocked(fs.copyFileSync).mockImplementation(() => {});

      const { backupFile } = await import('../../src/utils/fs.js');
      const result = backupFile('/path/to/file.txt');

      // Should return a backup path with timestamp format
      expect(result).toMatch(
        /\/path\/to\/file\.txt\.backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/
      );
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it('should return null for non-existing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { backupFile } = await import('../../src/utils/fs.js');
      const result = backupFile('/path/to/nonexistent.txt');

      expect(result).toBeNull();
    });

    it('should return null on copy error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      vi.mocked(fs.copyFileSync).mockImplementation(() => {
        throw new Error('Copy error');
      });

      const { backupFile } = await import('../../src/utils/fs.js');
      const result = backupFile('/path/to/file.txt');

      expect(result).toBeNull();
    });
  });

  describe('readJsonFile', () => {
    it('should parse and return JSON content', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('{"key": "value"}');

      const { readJsonFile } = await import('../../src/utils/fs.js');
      const result = readJsonFile<{ key: string }>('/path/to/file.json');

      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for invalid JSON', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json');

      const { readJsonFile } = await import('../../src/utils/fs.js');
      const result = readJsonFile('/path/to/file.json');

      expect(result).toBeNull();
    });

    it('should return null for non-existing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { readJsonFile } = await import('../../src/utils/fs.js');
      const result = readJsonFile('/path/to/nonexistent.json');

      expect(result).toBeNull();
    });
  });

  describe('writeJsonFile', () => {
    it('should write formatted JSON to file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const { writeJsonFile } = await import('../../src/utils/fs.js');
      const result = writeJsonFile('/path/to/file.json', { key: 'value' });

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/file.json',
        '{\n  "key": "value"\n}\n',
        'utf8'
      );
    });

    it('should return false on write error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      const { writeJsonFile } = await import('../../src/utils/fs.js');
      const result = writeJsonFile('/path/to/file.json', { key: 'value' });

      expect(result).toBe(false);
    });
  });

  describe('copyDirectory', () => {
    it('should copy directory recursively', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'file.txt', isDirectory: () => false },
        { name: 'subdir', isDirectory: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.copyFileSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => '');

      const { copyDirectory } = await import('../../src/utils/fs.js');
      const result = copyDirectory('/src', '/dest');

      expect(result).toBe(true);
    });

    it('should return false if source does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { copyDirectory } = await import('../../src/utils/fs.js');
      const result = copyDirectory('/nonexistent', '/dest');

      expect(result).toBe(false);
    });

    it('should create destination directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockImplementation(p => p === '/src');
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.mkdirSync).mockImplementation(() => '');

      const { copyDirectory } = await import('../../src/utils/fs.js');
      copyDirectory('/src', '/dest');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/dest', { recursive: true });
    });

    it('should return false on error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const { copyDirectory } = await import('../../src/utils/fs.js');
      const result = copyDirectory('/src', '/dest');

      expect(result).toBe(false);
    });
  });

  describe('listSubdirectories', () => {
    it('should return list of subdirectories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'dir1', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
        { name: 'dir2', isDirectory: () => true },
      ] as unknown as fs.Dirent[]);

      const { listSubdirectories } = await import('../../src/utils/fs.js');
      const result = listSubdirectories('/path/to/dir');

      expect(result).toEqual(['dir1', 'dir2']);
    });

    it('should return empty array for non-existing directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listSubdirectories } = await import('../../src/utils/fs.js');
      const result = listSubdirectories('/nonexistent');

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const { listSubdirectories } = await import('../../src/utils/fs.js');
      const result = listSubdirectories('/path/to/dir');

      expect(result).toEqual([]);
    });
  });
});
