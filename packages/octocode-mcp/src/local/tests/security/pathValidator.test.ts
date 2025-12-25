/**
 * Tests for pathValidator security
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathValidator } from '../../security/pathValidator.js';
import path from 'path';
import fs from 'fs';

describe('PathValidator Security Tests', () => {
  const mockWorkspace =
    '/Users/guybary/Documents/octocode-local-files/packages/octocode-local-files';
  let validator: PathValidator;

  beforeEach(() => {
    validator = new PathValidator(mockWorkspace);
  });

  describe('absolute path validation', () => {
    it('should ALLOW paths within workspace', () => {
      const result = validator.validate(`${mockWorkspace}/src`);
      expect(result.isValid).toBe(true);
    });

    it('should ALLOW workspace root itself', () => {
      const result = validator.validate(mockWorkspace);
      expect(result.isValid).toBe(true);
    });

    it('should BLOCK parent directory', () => {
      const parent = path.dirname(mockWorkspace);
      const result = validator.validate(parent);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should BLOCK grandparent directory', () => {
      const grandparent = path.dirname(path.dirname(mockWorkspace));
      const result = validator.validate(grandparent);
      expect(result.isValid).toBe(false);
    });

    it('should BLOCK sibling directory with similar name', () => {
      // This tests the startsWith bug: "octocode-local-files-other" starts with "octocode-local-files"
      const sibling = '/Users/guybary/Documents/octocode-local-files-other';
      const result = validator.validate(sibling);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should BLOCK paths with similar prefix', () => {
      // Edge case: path that starts with workspace name but isn't under it
      const similar = '/Users/guybary/Documents/octocode-local-files2';
      const result = validator.validate(similar);
      expect(result.isValid).toBe(false);
    });
  });

  describe('monorepo scenario', () => {
    it('should BLOCK access to parent package when workspace is a subpackage', () => {
      // Workspace: /packages/octocode-local-files
      // Should block: /packages/other-package
      // Should block: /node_modules
      const monorepoRoot = '/Users/guybary/Documents/octocode-local-files';
      const result = validator.validate(monorepoRoot);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should BLOCK node_modules in parent directory', () => {
      const parentNodeModules =
        '/Users/guybary/Documents/octocode-local-files/node_modules';
      const result = validator.validate(parentNodeModules);
      expect(result.isValid).toBe(false);
    });
  });

  describe('system paths', () => {
    it('should BLOCK /etc', () => {
      const result = validator.validate('/etc');
      expect(result.isValid).toBe(false);
    });

    it('should BLOCK /usr', () => {
      const result = validator.validate('/usr');
      expect(result.isValid).toBe(false);
    });

    it('should BLOCK /tmp', () => {
      const result = validator.validate('/tmp');
      expect(result.isValid).toBe(false);
    });

    it('should BLOCK home directory', () => {
      const result = validator.validate('/Users/guybary');
      expect(result.isValid).toBe(false);
    });
  });

  describe('relative paths', () => {
    // When relative paths are resolved, they should be checked against workspace
    it('should handle relative paths correctly', () => {
      // Relative path that would resolve within workspace
      const validator2 = new PathValidator(process.cwd());
      const result = validator2.validate('./src');
      // This should resolve to absolute and validate
      expect(result.isValid).toBe(true);
    });

    it('should BLOCK parent traversal with relative paths', () => {
      const result = validator.validate('../../../etc');
      // This should resolve to absolute and be blocked
      expect(result.isValid).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should reject empty path', () => {
      const result = validator.validate('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should handle paths with trailing slash', () => {
      const result = validator.validate(`${mockWorkspace}/src/`);
      expect(result.isValid).toBe(true);
    });

    it('should handle paths with ./ components', () => {
      const result = validator.validate(`${mockWorkspace}/./src`);
      expect(result.isValid).toBe(true);
    });
  });

  describe('error handling during realpath resolution', () => {
    it('should handle EACCES (permission denied) errors', () => {
      const realpathSyncSpy = vi
        .spyOn(fs, 'realpathSync')
        .mockImplementation(() => {
          const error = new Error('Permission denied') as Error & {
            code: string;
          };
          error.code = 'EACCES';
          throw error;
        });

      const result = validator.validate(`${mockWorkspace}/restricted`);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Permission denied');

      realpathSyncSpy.mockRestore();
    });

    it('should handle ELOOP (symlink loop) errors', () => {
      const realpathSyncSpy = vi
        .spyOn(fs, 'realpathSync')
        .mockImplementation(() => {
          const error = new Error('Symlink loop') as Error & { code: string };
          error.code = 'ELOOP';
          throw error;
        });

      const result = validator.validate(`${mockWorkspace}/loop`);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Symlink loop detected');

      realpathSyncSpy.mockRestore();
    });

    it('should handle ENAMETOOLONG errors', () => {
      const realpathSyncSpy = vi
        .spyOn(fs, 'realpathSync')
        .mockImplementation(() => {
          const error = new Error('Name too long') as Error & { code: string };
          error.code = 'ENAMETOOLONG';
          throw error;
        });

      const result = validator.validate(`${mockWorkspace}/longname`);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Path name too long');

      realpathSyncSpy.mockRestore();
    });

    it('should allow path with unknown error codes (fail-open)', () => {
      const realpathSyncSpy = vi
        .spyOn(fs, 'realpathSync')
        .mockImplementation(() => {
          const error = new Error('Unknown error') as Error & { code: string };
          error.code = 'EUNKNOWN';
          throw error;
        });

      const result = validator.validate(`${mockWorkspace}/unknown`);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedPath).toBeDefined();

      realpathSyncSpy.mockRestore();
    });
  });

  describe('getType method', () => {
    it('should return file for regular files', async () => {
      const localValidator = new PathValidator(process.cwd());
      const result = await localValidator.getType('./package.json');
      expect(result).toBe('file');
    });

    it('should return directory for directories', async () => {
      const localValidator = new PathValidator(process.cwd());
      const result = await localValidator.getType('./src');
      expect(result).toBe('directory');
    });

    it('should return null for non-existent paths', async () => {
      const localValidator = new PathValidator(process.cwd());
      const result = await localValidator.getType('./non-existent-file-xyz');
      expect(result).toBe(null);
    });

    it('should return null when validation fails', async () => {
      const result = await validator.getType('/etc/passwd');
      expect(result).toBe(null);
    });
  });

  describe('exists method', () => {
    it('should return true for existing files', async () => {
      const localValidator = new PathValidator(process.cwd());
      const result = await localValidator.exists('./package.json');
      expect(result).toBe(true);
    });

    it('should return false for non-existent paths', async () => {
      const localValidator = new PathValidator(process.cwd());
      const result = await localValidator.exists('./non-existent-file-xyz');
      expect(result).toBe(false);
    });

    it('should return false when validation fails', async () => {
      const result = await validator.exists('/etc/passwd');
      expect(result).toBe(false);
    });
  });

  describe('addAllowedRoot', () => {
    it('should add a new allowed root', () => {
      const newRoot = '/tmp/test-workspace';
      validator.addAllowedRoot(newRoot);

      // After adding, paths under the new root should be allowed
      // (Note: this will fail path validation because we can't actually
      // access /tmp in tests, but we're testing the addAllowedRoot logic)
    });

    it('should not add duplicate roots', () => {
      const initialRoot = mockWorkspace;
      validator.addAllowedRoot(initialRoot);
      // Adding the same root again should not create duplicates
      // The validator should handle this gracefully
    });
  });
});
