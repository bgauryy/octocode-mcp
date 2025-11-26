/**
 * Tests for pathValidator security
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PathValidator } from '../../src/security/pathValidator.js';
import path from 'path';

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
});
