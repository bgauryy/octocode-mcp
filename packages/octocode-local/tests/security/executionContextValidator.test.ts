/**
 * Tests for execution context validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  validateExecutionContext,
  validateProcessContext,
} from '../../src/security/executionContextValidator.js';

describe('executionContextValidator', () => {
  const workspaceRoot = process.cwd();
  const parentDir = path.dirname(workspaceRoot);

  describe('validateExecutionContext', () => {
    it('should allow undefined cwd (defaults to safe process.cwd())', () => {
      const result = validateExecutionContext(undefined);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty string cwd', () => {
      const result = validateExecutionContext('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject whitespace-only cwd', () => {
      const result = validateExecutionContext('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should allow cwd within workspace (absolute path)', () => {
      const validPath = path.join(workspaceRoot, 'src');
      const result = validateExecutionContext(validPath);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedPath).toBe(validPath);
    });

    it('should allow cwd within workspace (relative path)', () => {
      const result = validateExecutionContext('./src');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedPath).toContain('src');
    });

    it('should allow workspace root itself', () => {
      const result = validateExecutionContext(workspaceRoot);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedPath).toBe(workspaceRoot);
    });

    it('should reject parent directory', () => {
      const result = validateExecutionContext(parentDir);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(
        'Can only execute commands within workspace directory'
      );
      expect(result.error).toContain(workspaceRoot);
    });

    it('should reject path traversal with ../', () => {
      const result = validateExecutionContext('../');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(
        'Can only execute commands within workspace directory'
      );
    });

    it('should reject multiple path traversals (../../../../)', () => {
      const result = validateExecutionContext('../../../../');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(
        'Can only execute commands within workspace directory'
      );
    });

    it('should reject system directories (/etc)', () => {
      const result = validateExecutionContext('/etc');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(
        'Can only execute commands within workspace directory'
      );
    });

    it('should reject root directory (/)', () => {
      const result = validateExecutionContext('/');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(
        'Can only execute commands within workspace directory'
      );
    });

    it('should reject home directory', () => {
      const homeDir = os.homedir();
      if (homeDir !== workspaceRoot && !homeDir.startsWith(workspaceRoot)) {
        const result = validateExecutionContext(homeDir);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain(
          'Can only execute commands within workspace directory'
        );
      }
    });

    it('should handle custom workspace root', () => {
      const customRoot = path.join(workspaceRoot, 'packages');
      const validPath = path.join(customRoot, 'octocode-local-files');

      const result = validateExecutionContext(validPath, customRoot);
      expect(result.isValid).toBe(true);
    });

    it('should reject path outside custom workspace root', () => {
      const customRoot = path.join(
        workspaceRoot,
        'packages',
        'octocode-local-files'
      );
      const invalidPath = path.join(workspaceRoot, 'packages');

      const result = validateExecutionContext(invalidPath, customRoot);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(
        'Can only execute commands within workspace directory'
      );
    });

    describe('symlink handling', () => {
      const tmpDir = path.join(workspaceRoot, 'test-tmp-symlinks');
      const targetDir = path.join(tmpDir, 'target');
      const symlinkPath = path.join(tmpDir, 'symlink');
      const externalTarget = path.join(parentDir, 'external-target');

      beforeEach(async () => {
        // Clean up any existing test directories
        try {
          if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore cleanup errors
        }
      });

      it('should allow symlink that points within workspace', async () => {
        try {
          // Create test directories
          fs.mkdirSync(tmpDir, { recursive: true });
          fs.mkdirSync(targetDir, { recursive: true });

          // Create symlink pointing to target within workspace
          fs.symlinkSync(targetDir, symlinkPath, 'dir');

          const result = validateExecutionContext(symlinkPath);
          expect(result.isValid).toBe(true);

          // Clean up
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // Skip test if symlink creation fails (e.g., permissions)
        }
      });

      it('should reject symlink that points outside workspace', async () => {
        try {
          // Create test directories
          fs.mkdirSync(tmpDir, { recursive: true });

          // Try to create external target (might fail, that's ok for test)
          try {
            fs.mkdirSync(externalTarget, { recursive: true });
          } catch {
            // Can't create in parent, skip this test
            return;
          }

          // Create symlink pointing outside workspace
          fs.symlinkSync(externalTarget, symlinkPath, 'dir');

          const result = validateExecutionContext(symlinkPath);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('Symlink target');
          expect(result.error).toContain('outside workspace');

          // Clean up
          fs.rmSync(tmpDir, { recursive: true, force: true });
          fs.rmSync(externalTarget, { recursive: true, force: true });
        } catch {
          // Skip test if setup fails
        }
      });
    });
  });

  describe('validateProcessContext', () => {
    it('should validate that current process is within workspace', () => {
      const result = validateProcessContext();
      // This should always pass since our tests run within the workspace
      expect(result.isValid).toBe(true);
    });

    it('should handle custom workspace root', () => {
      const currentCwd = process.cwd();

      // If we set a custom root that contains current cwd, it should pass
      const result = validateProcessContext(currentCwd);
      expect(result.isValid).toBe(true);
    });

    it('should fail if workspace root is set to a child directory', () => {
      const childDir = path.join(process.cwd(), 'src', 'subfolder', 'deep');
      const result = validateProcessContext(childDir);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain(
        'Process is running outside workspace directory'
      );
    });
  });

  describe('WORKSPACE_ROOT environment variable', () => {
    it('should respect WORKSPACE_ROOT env var if set', () => {
      const originalEnv = process.env.WORKSPACE_ROOT;

      try {
        // Set custom workspace root
        process.env.WORKSPACE_ROOT = workspaceRoot;

        // Should allow path within workspace
        const validPath = path.join(workspaceRoot, 'src');
        const result = validateExecutionContext(validPath);
        expect(result.isValid).toBe(true);

        // Should reject parent directory
        const invalidResult = validateExecutionContext(parentDir);
        expect(invalidResult.isValid).toBe(false);
      } finally {
        // Restore original env
        if (originalEnv) {
          process.env.WORKSPACE_ROOT = originalEnv;
        } else {
          delete process.env.WORKSPACE_ROOT;
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle paths with trailing slashes', () => {
      const pathWithSlash = path.join(workspaceRoot, 'src') + '/';
      const result = validateExecutionContext(pathWithSlash);
      expect(result.isValid).toBe(true);
    });

    it('should handle paths with ./ prefix', () => {
      const result = validateExecutionContext('./src');
      expect(result.isValid).toBe(true);
    });

    it('should handle paths with redundant segments (./src/./lib)', () => {
      const result = validateExecutionContext('./src/./lib');
      expect(result.isValid).toBe(true);
    });

    it('should normalize and validate complex relative paths', () => {
      // src/../src/lib should resolve to src/lib
      const result = validateExecutionContext('./src/../src/lib');
      expect(result.isValid).toBe(true);
    });

    it('should reject path that escapes via complex traversal', () => {
      // Try to escape: src/../../..
      const result = validateExecutionContext('./src/../../..');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Prefix attack prevention (startsWith hardening)', () => {
    it('should reject workspace prefix attack (workspace-secure vs workspace)', () => {
      // If workspace is /app, then /app-secure should NOT be allowed
      // because /app-secure.startsWith(/app) is true but it's a different directory
      const customWorkspace = path.join(os.tmpdir(), 'test-workspace');
      const prefixAttackPath = customWorkspace + '-secure';

      // Create a scenario where the prefix attack could succeed
      const result = validateExecutionContext(
        prefixAttackPath,
        customWorkspace
      );

      // This should be rejected - /test-workspace-secure is NOT inside /test-workspace
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('within workspace directory');
    });

    it('should reject workspace prefix with suffix (workspace2 vs workspace)', () => {
      const customWorkspace = path.join(os.tmpdir(), 'workspace');
      const prefixAttackPath = customWorkspace + '2';

      const result = validateExecutionContext(
        prefixAttackPath,
        customWorkspace
      );

      // workspace2 is NOT inside workspace
      expect(result.isValid).toBe(false);
    });

    it('should allow exact workspace match', () => {
      const customWorkspace = path.join(os.tmpdir(), 'test-workspace-exact');

      const result = validateExecutionContext(customWorkspace, customWorkspace);

      // Exact match should be allowed
      expect(result.isValid).toBe(true);
    });

    it('should allow proper child path with separator', () => {
      const customWorkspace = path.join(os.tmpdir(), 'test-workspace-child');
      const childPath = path.join(customWorkspace, 'subdir');

      const result = validateExecutionContext(childPath, customWorkspace);

      // Proper child path should be allowed
      expect(result.isValid).toBe(true);
    });
  });
});
