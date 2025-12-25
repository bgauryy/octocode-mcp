import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';

// Mock shouldIgnore before importing PathValidator
const mockShouldIgnore = vi.fn();
vi.mock('../../../src/local/security/ignoredPathFilter.js', () => ({
  shouldIgnore: mockShouldIgnore,
}));

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      realpathSync: vi.fn(),
      promises: {
        access: vi.fn(),
        lstat: vi.fn(),
      },
    },
    realpathSync: vi.fn(),
    promises: {
      access: vi.fn(),
      lstat: vi.fn(),
    },
  };
});

import {
  PathValidator,
  pathValidator,
} from '../../../src/local/security/pathValidator.js';

describe('PathValidator', () => {
  let validator: PathValidator;
  const workspaceRoot = '/test/workspace';

  beforeEach(() => {
    validator = new PathValidator(workspaceRoot);
    vi.clearAllMocks();
    // Default behavior: resolve to same path
    vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) =>
      p.toString()
    );
    // Default behavior: don't ignore paths
    mockShouldIgnore.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should use provided workspace root', () => {
      const customValidator = new PathValidator('/custom/root');
      vi.mocked(fs.realpathSync).mockReturnValue('/custom/root/file.txt');
      const result = customValidator.validate('/custom/root/file.txt');
      expect(result.isValid).toBe(true);
    });

    it('should use process.cwd() when no workspace root provided', () => {
      const defaultValidator = new PathValidator();
      const cwd = process.cwd();
      vi.mocked(fs.realpathSync).mockReturnValue(path.join(cwd, 'file.txt'));
      const result = defaultValidator.validate(path.join(cwd, 'file.txt'));
      expect(result.isValid).toBe(true);
    });
  });

  describe('addAllowedRoot', () => {
    it('should add a new allowed root', () => {
      validator.addAllowedRoot('/another/root');
      vi.mocked(fs.realpathSync).mockReturnValue('/another/root/file.txt');
      const result = validator.validate('/another/root/file.txt');
      expect(result.isValid).toBe(true);
    });

    it('should not add duplicate roots', () => {
      validator.addAllowedRoot(workspaceRoot);
      validator.addAllowedRoot(workspaceRoot);
      // Should not throw and validator should work normally
      vi.mocked(fs.realpathSync).mockReturnValue(
        path.join(workspaceRoot, 'file.txt')
      );
      const result = validator.validate(path.join(workspaceRoot, 'file.txt'));
      expect(result.isValid).toBe(true);
    });
  });

  describe('validate', () => {
    it('should return invalid for empty path', () => {
      const result = validator.validate('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Path cannot be empty');
    });

    it('should return invalid for whitespace-only path', () => {
      const result = validator.validate('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Path cannot be empty');
    });

    it('should return valid for exact root match', () => {
      vi.mocked(fs.realpathSync).mockReturnValue(workspaceRoot);
      const result = validator.validate(workspaceRoot);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedPath).toBe(workspaceRoot);
    });

    it('should return valid for path within workspace', () => {
      const testPath = path.join(workspaceRoot, 'src', 'file.txt');
      vi.mocked(fs.realpathSync).mockReturnValue(testPath);
      const result = validator.validate(testPath);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedPath).toBe(testPath);
    });

    it('should return invalid for path outside workspace', () => {
      const result = validator.validate('/etc/passwd');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should return invalid for path that starts with workspace name but is sibling', () => {
      // /test/workspace-other is NOT a child of /test/workspace
      const result = validator.validate('/test/workspace-other/file.txt');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should handle path traversal attempts', () => {
      // The resolved path would be /etc/passwd
      const result = validator.validate('/test/workspace/../../../etc/passwd');
      expect(result.isValid).toBe(false);
    });

    describe('ignored paths', () => {
      it('should return invalid for .git directory', () => {
        const gitPath = path.join(workspaceRoot, '.git', 'config');
        vi.mocked(fs.realpathSync).mockReturnValue(gitPath);
        const result = validator.validate(gitPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('ignored');
      });

      it('should return invalid for .env file', () => {
        const envPath = path.join(workspaceRoot, '.env');
        vi.mocked(fs.realpathSync).mockReturnValue(envPath);
        const result = validator.validate(envPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('ignored');
      });

      it('should return invalid for node_modules directory', () => {
        const nmPath = path.join(
          workspaceRoot,
          'node_modules',
          'pkg',
          'index.js'
        );
        vi.mocked(fs.realpathSync).mockReturnValue(nmPath);
        const result = validator.validate(nmPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('ignored');
      });
    });

    describe('symlink handling', () => {
      it('should return invalid when symlink target is outside workspace', () => {
        const symlinkPath = path.join(workspaceRoot, 'link');
        vi.mocked(fs.realpathSync).mockReturnValue('/etc/passwd');
        const result = validator.validate(symlinkPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Symlink target');
        expect(result.error).toContain('outside allowed directories');
      });

      it('should return invalid when symlink target is in ignored directory', () => {
        const symlinkPath = path.join(workspaceRoot, 'link');
        const targetPath = path.join(workspaceRoot, '.git', 'config');
        vi.mocked(fs.realpathSync).mockReturnValue(targetPath);
        // First call for absolutePath check returns false, second for realPath returns true
        mockShouldIgnore
          .mockReturnValueOnce(false) // Initial absolutePath check
          .mockReturnValueOnce(true); // realPath (symlink target) check
        const result = validator.validate(symlinkPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Symlink target');
        expect(result.error).toContain('ignored');
      });

      it('should return valid when symlink target is within workspace', () => {
        const symlinkPath = path.join(workspaceRoot, 'link');
        const targetPath = path.join(workspaceRoot, 'real', 'file.txt');
        vi.mocked(fs.realpathSync).mockReturnValue(targetPath);
        const result = validator.validate(symlinkPath);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe(targetPath);
      });
    });

    describe('error handling', () => {
      it('should return valid for non-existent path (ENOENT)', () => {
        const testPath = path.join(workspaceRoot, 'non-existent.txt');
        const error = new Error('ENOENT') as Error & { code: string };
        error.code = 'ENOENT';
        vi.mocked(fs.realpathSync).mockImplementation(() => {
          throw error;
        });
        const result = validator.validate(testPath);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe(testPath);
      });

      it('should return invalid for permission denied (EACCES)', () => {
        const testPath = path.join(workspaceRoot, 'protected.txt');
        const error = new Error('EACCES') as Error & { code: string };
        error.code = 'EACCES';
        vi.mocked(fs.realpathSync).mockImplementation(() => {
          throw error;
        });
        const result = validator.validate(testPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Permission denied');
      });

      it('should return invalid for symlink loop (ELOOP)', () => {
        const testPath = path.join(workspaceRoot, 'circular-link');
        const error = new Error('ELOOP') as Error & { code: string };
        error.code = 'ELOOP';
        vi.mocked(fs.realpathSync).mockImplementation(() => {
          throw error;
        });
        const result = validator.validate(testPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Symlink loop');
      });

      it('should return invalid for path too long (ENAMETOOLONG)', () => {
        const longName = 'a'.repeat(300);
        const testPath = path.join(workspaceRoot, longName);
        const error = new Error('ENAMETOOLONG') as Error & { code: string };
        error.code = 'ENAMETOOLONG';
        vi.mocked(fs.realpathSync).mockImplementation(() => {
          throw error;
        });
        const result = validator.validate(testPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Path name too long');
      });

      it('should return valid for unknown errors (fail-open)', () => {
        const testPath = path.join(workspaceRoot, 'file.txt');
        const error = new Error('Unknown error') as Error & { code: string };
        error.code = 'UNKNOWN';
        vi.mocked(fs.realpathSync).mockImplementation(() => {
          throw error;
        });
        const result = validator.validate(testPath);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe(testPath);
      });

      it('should return valid for non-Error exceptions', () => {
        const testPath = path.join(workspaceRoot, 'file.txt');
        vi.mocked(fs.realpathSync).mockImplementation(() => {
          throw 'string error';
        });
        const result = validator.validate(testPath);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe(testPath);
      });
    });
  });

  describe('exists', () => {
    it('should return false for invalid path', async () => {
      const result = await validator.exists('/etc/passwd');
      expect(result).toBe(false);
    });

    it('should return false when sanitizedPath is undefined', async () => {
      // Empty path returns invalid without sanitizedPath
      const result = await validator.exists('');
      expect(result).toBe(false);
    });

    it('should return true for accessible path', async () => {
      const testPath = path.join(workspaceRoot, 'file.txt');
      vi.mocked(fs.realpathSync).mockReturnValue(testPath);
      vi.mocked(fs.promises.access).mockResolvedValue(undefined);
      const result = await validator.exists(testPath);
      expect(result).toBe(true);
    });

    it('should return false when access throws', async () => {
      const testPath = path.join(workspaceRoot, 'file.txt');
      vi.mocked(fs.realpathSync).mockReturnValue(testPath);
      vi.mocked(fs.promises.access).mockRejectedValue(new Error('Not found'));
      const result = await validator.exists(testPath);
      expect(result).toBe(false);
    });
  });

  describe('getType', () => {
    it('should return null for invalid path', async () => {
      const result = await validator.getType('/etc/passwd');
      expect(result).toBeNull();
    });

    it('should return null when sanitizedPath is undefined', async () => {
      const result = await validator.getType('');
      expect(result).toBeNull();
    });

    it('should return "file" for regular file', async () => {
      const testPath = path.join(workspaceRoot, 'file.txt');
      vi.mocked(fs.realpathSync).mockReturnValue(testPath);
      vi.mocked(fs.promises.lstat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as fs.Stats);
      const result = await validator.getType(testPath);
      expect(result).toBe('file');
    });

    it('should return "directory" for directory', async () => {
      const testPath = path.join(workspaceRoot, 'dir');
      vi.mocked(fs.realpathSync).mockReturnValue(testPath);
      vi.mocked(fs.promises.lstat).mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
        isSymbolicLink: () => false,
      } as fs.Stats);
      const result = await validator.getType(testPath);
      expect(result).toBe('directory');
    });

    it('should return "symlink" for symbolic link', async () => {
      const testPath = path.join(workspaceRoot, 'link');
      vi.mocked(fs.realpathSync).mockReturnValue(testPath);
      vi.mocked(fs.promises.lstat).mockResolvedValue({
        isFile: () => false,
        isDirectory: () => false,
        isSymbolicLink: () => true,
      } as fs.Stats);
      const result = await validator.getType(testPath);
      expect(result).toBe('symlink');
    });

    it('should return null for unknown type', async () => {
      const testPath = path.join(workspaceRoot, 'special');
      vi.mocked(fs.realpathSync).mockReturnValue(testPath);
      vi.mocked(fs.promises.lstat).mockResolvedValue({
        isFile: () => false,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as fs.Stats);
      const result = await validator.getType(testPath);
      expect(result).toBeNull();
    });

    it('should return null when lstat throws', async () => {
      const testPath = path.join(workspaceRoot, 'file.txt');
      vi.mocked(fs.realpathSync).mockReturnValue(testPath);
      vi.mocked(fs.promises.lstat).mockRejectedValue(new Error('Not found'));
      const result = await validator.getType(testPath);
      expect(result).toBeNull();
    });
  });

  describe('global pathValidator instance', () => {
    it('should be a PathValidator instance', () => {
      expect(pathValidator).toBeInstanceOf(PathValidator);
    });
  });
});
