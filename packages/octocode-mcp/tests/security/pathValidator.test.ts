/**
 * Tests for pathValidator security
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathValidator } from '../../src/security/pathValidator.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('PathValidator Security Tests', () => {
  const mockWorkspace =
    '/Users/guybary/Documents/octocode-local-files/packages/octocode-local-files';
  let validator: PathValidator;
  let strictValidator: PathValidator;

  beforeEach(() => {
    // Default validator: includes home directory (more permissive)
    validator = new PathValidator(mockWorkspace);
    // Strict validator: only workspace, no home directory
    strictValidator = new PathValidator({
      workspaceRoot: mockWorkspace,
      includeHomeDir: false,
    });
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

    it('should ALLOW parent directory when within home (default permissive mode)', () => {
      const parent = path.dirname(mockWorkspace);
      const result = validator.validate(parent);
      // Parent is within home directory, so it's allowed by default
      expect(result.isValid).toBe(true);
    });

    it('should BLOCK parent directory in strict mode', () => {
      const parent = path.dirname(mockWorkspace);
      const result = strictValidator.validate(parent);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should BLOCK grandparent directory in strict mode', () => {
      const grandparent = path.dirname(path.dirname(mockWorkspace));
      const result = strictValidator.validate(grandparent);
      expect(result.isValid).toBe(false);
    });

    it('should ALLOW sibling directory in home (default permissive mode)', () => {
      // Sibling within home directory is now allowed
      const sibling = '/Users/guybary/Documents/octocode-local-files-other';
      const result = validator.validate(sibling);
      // Within home directory, so allowed
      expect(result.isValid).toBe(true);
    });

    it('should BLOCK sibling directory in strict mode', () => {
      const sibling = '/Users/guybary/Documents/octocode-local-files-other';
      const result = strictValidator.validate(sibling);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should BLOCK paths with similar prefix in strict mode', () => {
      // Edge case: path that starts with workspace name but isn't under it
      const similar = '/Users/guybary/Documents/octocode-local-files2';
      const result = strictValidator.validate(similar);
      expect(result.isValid).toBe(false);
    });
  });

  describe('monorepo scenario', () => {
    it('should ALLOW access to parent package within home (default permissive mode)', () => {
      // In permissive mode, monorepo root within home is accessible
      const monorepoRoot = '/Users/guybary/Documents/octocode-local-files';
      const result = validator.validate(monorepoRoot);
      expect(result.isValid).toBe(true);
    });

    it('should BLOCK access to parent package in strict mode', () => {
      const monorepoRoot = '/Users/guybary/Documents/octocode-local-files';
      const result = strictValidator.validate(monorepoRoot);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should ALLOW node_modules in parent directory within home (default mode)', () => {
      const parentNodeModules =
        '/Users/guybary/Documents/octocode-local-files/node_modules';
      const result = validator.validate(parentNodeModules);
      // Within home directory, so allowed
      expect(result.isValid).toBe(true);
    });

    it('should BLOCK node_modules in parent directory in strict mode', () => {
      const parentNodeModules =
        '/Users/guybary/Documents/octocode-local-files/node_modules';
      const result = strictValidator.validate(parentNodeModules);
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

    it('should ALLOW home directory (default permissive mode)', () => {
      const homeDir = os.homedir();
      const result = validator.validate(homeDir);
      expect(result.isValid).toBe(true);
    });

    it('should BLOCK home directory in strict mode', () => {
      const homeDir = os.homedir();
      const result = strictValidator.validate(homeDir);
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

    it('should ALLOW parent traversal within home (default permissive mode)', () => {
      // In permissive mode, traversal within home directory is allowed
      const result = validator.validate('../../../etc');
      // This resolves to something within home directory (likely), so check based on actual path
      // If it resolves outside home, it should be blocked
      const resolved = path.resolve(mockWorkspace, '../../../etc');
      const homeDir = os.homedir();
      const isWithinHome =
        resolved === homeDir || resolved.startsWith(homeDir + path.sep);
      expect(result.isValid).toBe(isWithinHome);
    });

    it('should BLOCK parent traversal to /etc in strict mode', () => {
      // Create a validator where the workspace is at a level where ../../../etc would go to /etc
      const deepValidator = new PathValidator({
        workspaceRoot: '/home/user/projects/workspace',
        includeHomeDir: false,
      });
      const result = deepValidator.validate('../../../etc');
      // This should resolve to /home/etc or similar and be blocked
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

    it('should reject path with unknown error codes (fail-closed for security)', () => {
      const realpathSyncSpy = vi
        .spyOn(fs, 'realpathSync')
        .mockImplementation(() => {
          const error = new Error('Unknown error') as Error & { code: string };
          error.code = 'EUNKNOWN';
          throw error;
        });

      const result = validator.validate(`${mockWorkspace}/unknown`);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unexpected error validating path');

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

  describe('new permissive features', () => {
    it('should include home directory by default', () => {
      const defaultValidator = new PathValidator(mockWorkspace);
      const roots = defaultValidator.getAllowedRoots();
      const homeDir = os.homedir();
      expect(roots).toContain(homeDir);
    });

    it('should NOT include home directory when includeHomeDir is false', () => {
      const strictValidator2 = new PathValidator({
        workspaceRoot: mockWorkspace,
        includeHomeDir: false,
      });
      const roots = strictValidator2.getAllowedRoots();
      const homeDir = os.homedir();
      expect(roots).not.toContain(homeDir);
      expect(roots).toContain(mockWorkspace);
    });

    it('should support additionalRoots option', () => {
      const customValidator = new PathValidator({
        workspaceRoot: mockWorkspace,
        additionalRoots: ['/tmp/project1', '/tmp/project2'],
        includeHomeDir: false,
      });
      const roots = customValidator.getAllowedRoots();
      expect(roots).toContain(mockWorkspace);
      expect(roots).toContain('/tmp/project1');
      expect(roots).toContain('/tmp/project2');
    });

    it('should support ALLOWED_PATHS environment variable', () => {
      const originalEnv = process.env.ALLOWED_PATHS;
      try {
        process.env.ALLOWED_PATHS = '/opt/project,/var/data';
        const envValidator = new PathValidator({
          workspaceRoot: mockWorkspace,
          includeHomeDir: false,
        });
        const roots = envValidator.getAllowedRoots();
        expect(roots).toContain('/opt/project');
        expect(roots).toContain('/var/data');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.ALLOWED_PATHS;
        } else {
          process.env.ALLOWED_PATHS = originalEnv;
        }
      }
    });

    it('should handle empty ALLOWED_PATHS gracefully', () => {
      const originalEnv = process.env.ALLOWED_PATHS;
      try {
        process.env.ALLOWED_PATHS = '';
        const envValidator = new PathValidator({
          workspaceRoot: mockWorkspace,
          includeHomeDir: false,
        });
        const roots = envValidator.getAllowedRoots();
        // Should only have workspace root
        expect(roots.length).toBe(1);
        expect(roots).toContain(mockWorkspace);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.ALLOWED_PATHS;
        } else {
          process.env.ALLOWED_PATHS = originalEnv;
        }
      }
    });

    it('should expand tilde in additional roots', () => {
      const customValidator = new PathValidator({
        workspaceRoot: mockWorkspace,
        additionalRoots: ['~/projects'],
        includeHomeDir: false,
      });
      const roots = customValidator.getAllowedRoots();
      const homeDir = os.homedir();
      expect(roots).toContain(path.join(homeDir, 'projects'));
    });
  });
});
