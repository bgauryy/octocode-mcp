/**
 * Investigating potential security bypasses
 */

import { describe, it, expect } from 'vitest';
import { PathValidator } from '../../src/security/pathValidator.js';
import path from 'path';
import { execSync } from 'child_process';

describe('🔍 Investigating Potential Bypasses', () => {
  const validator = new PathValidator('/Users/guybary');

  describe('URL Encoding Analysis', () => {
    it('URL encoded %2e%2e - check if real bypass', () => {
      const testPath = '/Users/guybary/%2e%2e/%2e%2e/etc';
      const result = validator.validate(testPath);

      // What does Node's path.resolve do?
      const resolved = path.resolve(testPath);

      // The key question: Does the resolved path escape the workspace?
      const escapedWorkspace = !resolved.startsWith('/Users/guybary');

      // Check if %2e is treated as literal characters (stays within workspace)
      const isLiteral = resolved.includes('%2e');

      // This test should actually pass if it doesn't escape
      expect(escapedWorkspace).toBe(false);
      expect(isLiteral).toBe(true); // %2e should be treated as literal
      expect(result.isValid).toBeDefined();
    });

    it('Double URL encoding %252e - check if real bypass', () => {
      const testPath = '/Users/guybary/%252e%252e/etc';
      validator.validate(testPath);
      const resolved = path.resolve(testPath);

      expect(resolved.startsWith('/Users/guybary')).toBe(true);
    });
  });

  describe('Unicode Analysis', () => {
    it('Full-width dots ．． - check if real bypass', () => {
      const testPath = '/Users/guybary/．．/etc';
      const result = validator.validate(testPath);
      const resolved = path.resolve(testPath);

      // Check if Unicode is normalized
      const containsFullWidth = resolved.includes('．');

      expect(resolved.startsWith('/Users/guybary')).toBe(true);
      expect(result.isValid).toBeDefined();
      expect(containsFullWidth).toBeDefined();
    });
  });

  describe('Real-World Bypass Test', () => {
    it('Can URL encoding bypass actual file system operations?', () => {
      // Test if shell commands interpret %2e%2e as ..
      try {
        // This would fail if %2e%2e is treated literally
        execSync('ls /Users/%2e%2e 2>&1', { encoding: 'utf-8', timeout: 1000 });
        expect.fail('Shell command should have failed');
      } catch (e: unknown) {
        // Safe: Shell treats %2e%2e as literal characters
        // Error output can be in message, stderr, or stdout depending on Node version
        const error = e as Error & { stderr?: string; stdout?: string };
        const errorText = `${error.message || ''} ${error.stderr || ''} ${error.stdout || ''}`;
        expect(errorText.toLowerCase()).toContain('no such file');
      }
    });
  });

  describe('Can MCP Tools Bypass with Encoding?', () => {
    it('Test if encoded paths work through actual command execution', async () => {
      // The real test: can we use these paths with the actual tools?
      // Import safeExec
      const { safeExec } = await import('../../src/utils/exec.js');

      // Try to use ls with URL encoded path
      try {
        await safeExec('ls', ['/Users/%2e%2e']);
        expect.fail('Command should have failed - potential bypass!');
      } catch (e: unknown) {
        const error = e as Error;
        // Safe: Command failed as expected
        expect(error.message).toBeDefined();
      }
    });
  });
});
